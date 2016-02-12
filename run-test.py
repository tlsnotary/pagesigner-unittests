import http.server
import ssl
import threading
import shutil
import subprocess
import socket
import time
import os
import sys
import platform
import random
import hashlib

OS = platform.system()
shared_memory = '/dev/shm'
unittests_dir =  os.path.dirname(os.path.realpath(__file__))
parent_dir = os.path.dirname(unittests_dir)
pagesigner_dir = os.path.join(parent_dir, 'pagesigner')
#set current working dir so this script could be run from any location
os.chdir(unittests_dir)
returncode = None #wll be set by verdict thread

signingproc = None
notaryproc = None
chromeproc = None
ffproc = None
firefox_path = None
chrome_path = None
openssl_path = None
python3_path = None
keepopen = None #if True dont close browsers after the test successfully finished
chromeonly = None #if True dont launch firefox
firefoxonly = None #if True dont launch Chrome


class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
                #(idk how to override default non-deterministic headers)
        #hard-code headers so that they are always deterministic
        self.send_header('Header1', 'one')
        self.send_header('Header2', 'two')
        http.server.SimpleHTTPRequestHandler.end_headers(self) 

#a thread which returns a value. This is achieved by passing self as the first argument to a target function
#the target_function(parentthread, arg1, arg2) can then set, e.g parentthread.retval
class ThreadWithRetval(threading.Thread):
    def __init__(self, target, args=()):
        super(ThreadWithRetval, self).__init__(target=target, args = (self,)+args )
    retval = ''

def server_thread():
    httpd = http.server.HTTPServer(('127.0.0.1', 4443), CustomHTTPRequestHandler)
    httpd.socket = ssl.wrap_socket (httpd.socket, keyfile=os.path.join(unittests_dir, 'certs', 'normal.priv'), certfile=os.path.join(unittests_dir, 'certs', 'normal_chain.cert'), server_side=True)
    httpd.serve_forever()

def reliable_site_thread():
    httpd = http.server.HTTPServer(('127.0.0.1', 5443), http.server.SimpleHTTPRequestHandler)
    httpd.socket = ssl.wrap_socket (httpd.socket, keyfile=os.path.join(unittests_dir, 'certs', 'reliable.priv'), certfile=os.path.join(unittests_dir, 'certs', 'reliable_chain.cert'), server_side=True)
    httpd.serve_forever()

def build_random_records():
    rec_no = random.randint(10, 20)
    recs = [] #records as well as timeout values [bytes(), 0.6, bytes(), bytes(), ...]
    for i in range(rec_no):
        rec_len = random.randint(1024, 65530)
        rec_header = b'\x16\x03\x01' + rec_len.to_bytes(2, byteorder='big')
        tls_record = rec_header + bytes(rec_len)
        recs.append(tls_record)
    #the last record contains md5sum
    recs_flat = b''.join(r for r in recs)
    md5obj = hashlib.md5(recs_flat)
    recs.append(b'\x16\x03\x01' + len(md5obj.digest()).to_bytes(2, byteorder='big') + md5obj.digest())
    print('length of records ', len(recs_flat))
    print ('md5sum is ', md5obj.hexdigest())

    positions = random.sample(range(1, len(recs)), int(rec_no / 4))
    positions.sort()
    for i,pos in enumerate(positions):
        recs.insert(pos+i, random.randint(1,9)/10)

    splitrecs = [] #records as well as timeout values [bytes(), 0.6, bytes(), bytes(), ...]
    for rec in recs:
        if isinstance(rec, float):
            splitrecs.append(rec)
            continue
        if random.randint(1, 3) != 3:
            #split every 3rd record
            splitrecs.append(rec)
            continue
        split_pos = random.randint(1, len(rec))
        splitrecs.append(rec[:split_pos])
        splitrecs.append(random.randint(1,30)/10)
        splitrecs.append(rec[split_pos:])
    return splitrecs    


def socket_tester_thread(portdelta):
	#portdelta 0 for chrome 1000 for firefox
    #socket that cannot be connected to because it is not listening
    sock1 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock1.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock1.bind(('127.0.0.1', 16441+portdelta))

    #socket that can be connected to but that sends no data - to test recv() timeout
    sock2 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock2.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock2.bind(('127.0.0.1', 16442+portdelta))
    sock2.listen(1)

    #this socket must be opened in advance
    sock4 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock4.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock4.bind(('127.0.0.1', 16444+portdelta))
    sock4.listen(1) 

    #socket to test complete record timeout by sending an incomplete record
    sock3 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock3.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock3.bind(('127.0.0.1', 16443+portdelta))
    sock3.listen(1)
    s3, client_address = sock3.accept()
    #if sending immediately the helper app may not pick it up
    time.sleep(0.1)
    s3.send(b'\x16\x03\x01\x00\x01\xff')

    s4, client_address = sock4.accept()
    data_in = s4.recv(1024)
    if data_in.decode() != 'hello world':
        error = 'failed to receive hello world, test failed'
        s4.send(error.encode())
        s4.close()
        print(error)
        return
    #randomly send complete/incomplete records
    print('building random records')
    recs = build_random_records()
    #recs contains records as well as timeout values [bytes(), 0.6, bytes(), bytes(), ...]
    for rec in recs:
        if isinstance(rec, float):
            time.sleep(rec)
            continue
        s4.send(rec)


def testing_verdict_thread(parentthread, port):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server_address = ('127.0.0.1', port)
    sock.bind(server_address)
    sock.listen(1)
    conn, client_address = sock.accept()
    data_bytes = conn.recv(1024)
    data_str = data_bytes.decode()
    if data_str.count('TEST_PASSED') == 1:
        print('TEST PASSED for port', str(port))
        parentthread.retval = 0
    else:
        print('TEST FAILED. Please examine the reason and manually terminate all running processes')
        parentthread.retval = 1

    
def cleanup_and_quit(source):
    for proc in [notaryproc, signingproc]:
        if proc:
            proc.terminate()
    for proc in [chromeproc, ffproc]:
        if proc and not keepopen:
            proc.terminate()
    if source == 'keyboard':
        print('Exit code 1')
        exit(1)
    elif source == 'test passed':
        print ('All tests PASSED')
        exit(0)
    

def find_executables():
    global firefox_path
    global chrome_path
    global python3_path
    global openssl_path
    if OS == 'Linux':
        if not firefox_path: firefox_path = 'firefox'
        if not chrome_path: chrome_path = 'google-chrome'
        if not python3_path:  python3_path = 'python3'
        if not openssl_path: openssl_path = 'openssl'
    elif OS == 'Darwin':
        if not firefox_path: firefox_path = '/Applications/Firefox.app/Contents/MacOS/firefox'
        if not chrome_path: chrome_path = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        if not python3_path:  python3_path = 'python3'
        if not openssl_path: openssl_path = 'openssl'
    elif OS == 'Windows':
    
        def findexe(exe):
            locations = os.environ['PROGRAMFILES'].split(';') + os.environ['PATH'].split(';') + [os.path.join(os.environ['USERPROFILE'], 'Local Settings', 'Application Data')]+['C:\\Python34', 'C:\\OpenSSL-Win32\\bin']
            for loc in locations:
                fullpath = os.path.join(loc, exe)
                if os.path.exists(fullpath):
                    return fullpath
            raise Exception('Could not find ' + exe)

        if not firefox_path:
           firefox_path = findexe(os.path.join('Mozilla Firefox', 'firefox.exe'))
        if not chrome_path:
           chrome_path = findexe(os.path.join('Google', 'Chrome', 'Application', 'chrome.exe'))
        if not python3_path:
           python3_path = findexe('python.exe')
        if not openssl_path:
            openssl_path = findexe('openssl.exe')
                    
            
        
def output2hexbytelist(output, starttoken, finishtoken):
    lines = output.decode().split('\n')
    start = None
    finish = None
    for i, line in enumerate(lines):
        x = line.strip() #remove leading spaces
        if x.startswith(starttoken):
            start = i+1
        elif x.startswith(finishtoken):
            finish = i
            break
    if (not start) or (not finish):
        raise Exception('Could not parse OpenSSL output')
    modulus_string = ''.join(lines[start:finish])
    hex_bytes_list = modulus_string.replace(' ','').split(':')[1:] 
    return hex_bytes_list


if __name__ == "__main__":
    try:
        for arg in sys.argv:
            if arg.startswith('firefox_path='):
                firefox_path = arg.split('=')[1]
            if arg.startswith('chrome_path='):
                chrome_path = arg.split('=')[1]
            if arg.startswith('openssl_path='):
                openssl_path = arg.split('=')[1]
            if arg.startswith('python3_path='):
                python3_path = arg.split('=')[1]
            if arg == 'keepopen':
                keepopen = True
            if arg == 'chromeonly':
                chromeonly = True
            if arg == 'firefoxonly':
                firefoxonly = True


        find_executables()

        if OS == 'Windows':
            path = os.path.join(unittests_dir, 'shared_memory_win')
            shared_memory = path
            if not os.path.exists(path):
                os.mkdir(path)
        elif OS == 'Darwin':
            path = os.path.join(unittests_dir, 'shared_memory_mac')
            shared_memory = path
            if not os.path.exists(path):
                os.mkdir(path)            
                
        certs_dir = os.path.join(unittests_dir, 'certs')
        if not os.path.exists(certs_dir):
            os.mkdir(certs_dir)
            #create root CA privkey
            configarg = []
            if OS == 'Windows':
                os.environ['OPENSSL_CONF'] = 'C:\\OpenSSL-Win32\\bin\\openssl.cfg'
            print('generating root CA cert')
            subprocess.call([openssl_path, 'genrsa', '-out', os.path.join(certs_dir, 'rootCA.priv'), '4096'])
            #create self-signed root CA cert
            subprocess.call([openssl_path, 'req', '-x509', '-new', '-nodes', '-subj',  '/CN=TLSNOTARY', '-key', os.path.join(certs_dir, 'rootCA.priv'), '-days', '1024', '-out', os.path.join(certs_dir, 'rootCA.cert')])
            subprocess.call([openssl_path, 'x509', '-outform', 'der', '-in', os.path.join(certs_dir, 'rootCA.cert'), '-out', os.path.join(certs_dir, 'rootCA.certder')])
            #create normal cert privkey
            print('generating server cert')
            subprocess.call([openssl_path, 'genrsa', '-out', os.path.join(certs_dir, 'normal.priv'), '2048'])
            #generate a cert signing request
            subprocess.call([openssl_path, 'req', '-new', '-subj', '/CN=127.0.0.1', '-key', os.path.join(certs_dir, 'normal.priv'), '-out', os.path.join(certs_dir, 'normal.csr')])
            #sign the CSR
            subprocess.call([openssl_path, 'x509', '-req', '-in', os.path.join(certs_dir, 'normal.csr'), '-CA', os.path.join(certs_dir, 'rootCA.cert'), '-CAkey', os.path.join(certs_dir, 'rootCA.priv'), '-CAcreateserial', '-out', os.path.join(certs_dir, 'normal.cert'), '-days', '1024'])
            subprocess.call([openssl_path, 'x509', '-outform', 'der', '-in', os.path.join(certs_dir, 'normal.cert'), '-out', os.path.join(certs_dir, 'normal.certder')])
            #create reliable site privkey, pubkey, create CSR, sign CSR
            print('generating reliable site cert')
            subprocess.call([openssl_path, 'genrsa', '-out', os.path.join(certs_dir, 'reliable.priv'), '2048'])
            subprocess.call([openssl_path, 'rsa', '-in', os.path.join(certs_dir, 'reliable.priv'), '-outform', 'PEM', '-pubout', '-out', os.path.join(certs_dir, 'reliable.pub')])
            subprocess.call([openssl_path, 'req', '-new', '-subj', '/CN=PageSigner reliable site', '-key', os.path.join(certs_dir, 'reliable.priv'), '-out', os.path.join(certs_dir, 'reliable.csr')])
            subprocess.call([openssl_path, 'x509', '-req', '-in', os.path.join(certs_dir, 'reliable.csr'), '-CA', os.path.join(certs_dir, 'rootCA.cert'), '-CAkey', os.path.join(certs_dir, 'rootCA.priv'), '-CAcreateserial', '-out', os.path.join(certs_dir, 'reliable.cert'), '-days', '1024'])
            #create a chain which python's TLS will need
            with open(os.path.join(certs_dir, 'rootCA.cert'), 'rb') as f:
                rootCA_cert = f.read()
            with open(os.path.join(certs_dir, 'normal.cert'), 'rb') as f:
                normal_cert = f.read()
            with open(os.path.join(certs_dir, 'reliable.cert'), 'rb') as f:
                reliable_cert = f.read()
            with open(os.path.join(certs_dir, 'normal_chain.cert'), 'wb') as f:
                f.write(normal_cert+rootCA_cert)
            with open(os.path.join(certs_dir, 'reliable_chain.cert'), 'wb') as f:
                f.write(reliable_cert+rootCA_cert)
           
            print('generating signing server cert')
            subprocess.call([openssl_path, 'genrsa', '-out', os.path.join(certs_dir, 'signing_server_private.priv'), '4096'])
            subprocess.call([openssl_path, 'rsa', '-in', os.path.join(certs_dir, 'signing_server_private.priv'), '-outform', 'PEM', '-pubout', '-out', os.path.join(certs_dir, 'signing_server_public.pub')])

            output = subprocess.check_output([openssl_path, 'rsa', '-pubin', '-inform', 'PEM', '-text', '-noout', '-in', os.path.join(certs_dir, 'reliable.pub')])

            hex_bytes_list = output2hexbytelist(output, 'Modulus', 'Exponent')
            write_to_file = 'Name=127.0.0.1\nExpires=04/08/2018\nModulus=\n'
            for i, hexbyte in enumerate(hex_bytes_list):
                write_to_file += hexbyte+' '
                if (i+1) % 16 == 0:
                    write_to_file += '\n'
            with open(os.path.join(certs_dir, 'reliable_site_pubkey.txt'), 'wb') as f:
                f.write(write_to_file.encode())

            output = subprocess.check_output([openssl_path, 'rsa', '-pubin', '-inform', 'PEM', '-text', '-noout', '-in', os.path.join(certs_dir, 'signing_server_public.pub')])
            hex_bytes_list = output2hexbytelist(output, 'Modulus', 'Exponent')
            modulus_number_array = ','.join([str(int(hexchar, 16)) for hexchar in hex_bytes_list])
            with open(os.path.join(certs_dir, 'signing_server_pubkey.txt'), 'wb') as f:
                f.write(modulus_number_array.encode())

        verifychain_dir = os.path.join(unittests_dir, 'verifychain')
        if not os.path.exists(verifychain_dir):
            os.mkdir(verifychain_dir)        
            print('generating unknown root CA cert')
            subprocess.call([openssl_path, 'genrsa', '-out', os.path.join(verifychain_dir, 'unknown_rootCA.priv'), '4096'])
            #create self-signed root CA cert
            subprocess.call([openssl_path, 'req', '-x509', '-new', '-nodes', '-subj',  '/CN=TLSNOTARY_UNKNOWN', '-key', os.path.join(verifychain_dir, 'unknown_rootCA.priv'), '-days', '1024', '-outform', 'der', '-out', os.path.join(verifychain_dir, 'unknown_rootCA.certder')])
            shutil.copy(os.path.join(verifychain_dir, 'unknown_rootCA.certder'), os.path.join(pagesigner_dir, 'content', 'testing', 'unknown_rootCA.certder'))
            #in order to corrupt the sig, we must know what the sig is
            #no_signame because otherwise the starttoken is printed twice
            output = subprocess.check_output([openssl_path, 'x509', '-text', '-certopt', 'no_signame', '-in', os.path.join(certs_dir, 'normal.cert')])
            hexbytelist = output2hexbytelist(output, 'Signature Algorithm', '-----BEGIN CERTIFICATE')
            sigbytes = bytes()
            for hexstr in hexbytelist:
                sigbytes += (int(hexstr, 16)).to_bytes(1, byteorder='big')
            with open(os.path.join(certs_dir, 'normal.certder'), 'rb') as f:
                normalcertder = f.read()
            sigstart = normalcertder.find(sigbytes)
            if sigstart == -1:
                raise Exception('cannot find sig in cert')
            bad_byte_pos = random.randint(0, len(sigbytes)-1)
            #make a byte corrupted by adding 1 mod 255 to it
            normalcert_with_badsig = \
                normalcertder[:sigstart+bad_byte_pos] + \
                ((normalcertder[sigstart+bad_byte_pos] + 1) % 255).to_bytes(1, byteorder='big') + \
                normalcertder[sigstart+bad_byte_pos+1:]
            with open(os.path.join(verifychain_dir, 'normal_badsig.certder'), 'wb') as f:
                f.write(normalcert_with_badsig)
            shutil.copy(os.path.join(unittests_dir, 'certs', 'rootCA.certder'), os.path.join(pagesigner_dir, 'content', 'testing', 'rootCA.certder'))
            shutil.copy(os.path.join(verifychain_dir, 'normal_badsig.certder'), os.path.join(pagesigner_dir, 'content', 'testing', 'normal_badsig.certder'))
           

        threading.Thread(target=server_thread, daemon=True).start()
        threading.Thread(target=reliable_site_thread, daemon=True).start()
        threading.Thread(target=socket_tester_thread, daemon=True, args=(0,)).start()
        threading.Thread(target=socket_tester_thread, daemon=True, args=(1000,)).start()
        #notary oracle expects the keys in /dev/shm
        shutil.copy(os.path.join(certs_dir, 'signing_server_private.priv'), os.path.join(shared_memory, 'private.pem'))
        shutil.copy(os.path.join(certs_dir, 'signing_server_public.pub'), os.path.join(shared_memory, 'signing_server_public.pem'))
        #Let notary server know about our testing reliable site's pubkey
        shutil.copy(os.path.join(certs_dir, 'reliable_site_pubkey.txt'), os.path.join(parent_dir, 'pagesigner-oracles', 'notary', 'pubkeys.txt'))
        
        notaryproc = subprocess.Popen([python3_path, os.path.join(parent_dir, 'pagesigner-oracles', 'notary', 'notaryserver.py')])
        signingproc = subprocess.Popen([python3_path, os.path.join(parent_dir, 'pagesigner-oracles', 'signing_server', 'signing_server.py'), 'shared_memory='+shared_memory, 'openssl_path='+openssl_path])
        
        shutil.copy(os.path.join(unittests_dir, 'testing.js'), os.path.join(pagesigner_dir, 'content', 'testing', 'testing.js'))
        shutil.copy(os.path.join(unittests_dir, 'manager_test.js'), os.path.join(pagesigner_dir, 'content', 'testing', 'manager_test.js'))
        shutil.copy(os.path.join(unittests_dir, 'testpage.html'), os.path.join(pagesigner_dir, 'content', 'testing', 'testpage.html'))
        shutil.copy(os.path.join(unittests_dir, 'certs', 'reliable_site_pubkey.txt'), 
                    os.path.join(pagesigner_dir, 'content', 'testing', 'reliable_site_pubkey.txt'))
        shutil.copy(os.path.join(unittests_dir, 'certs', 'signing_server_pubkey.txt'), 
                            os.path.join(pagesigner_dir, 'content', 'testing', 'signing_server_pubkey.txt'))
        shutil.copy(os.path.join(unittests_dir, 'certs', 'rootCA.cert'), 
                                   os.path.join(pagesigner_dir, 'content', 'testing', 'rootCA.cert'))

        if not firefoxonly:
            print('Starting Chrome')
            chromeproc = subprocess.Popen([chrome_path, 'http://127.0.0.1:0/pagesigner_testing_on_chrome', '--profile-directory=PageSigner', '--load-extension='+pagesigner_dir, '--allow-insecure-localhost'])

        if not chromeonly:
            if OS == 'Linux':
                suffix = 'firefox-linux'
            elif OS == 'Windows':
                suffix = 'firefox-win'
            elif OS == 'Darwin':
                suffix = 'firefox-mac'
            firefox_profile_dir = os.path.join(unittests_dir, suffix)
            if not os.path.exists(firefox_profile_dir):
                os.mkdir(firefox_profile_dir)
                #if we put the extension in an empty profile fir, FF will ignore it
                #so we start FF allowing it  to create the skeleton profile and then terminate it
                ffprobeproc = subprocess.Popen([firefox_path, '--new-instance', '--profile', firefox_profile_dir])
                #give FF ample time to initialize otherwise it will ignore the extensions dir
                time.sleep(5)
                ffprobeproc.terminate()
            profile_extension_dir = os.path.join(firefox_profile_dir, 'extensions')
            if not os.path.exists(profile_extension_dir):
                os.mkdir(profile_extension_dir)
                with open(os.path.join(profile_extension_dir, 'pagesigner@tlsnotary'), 'wb') as f:
                    f.write(pagesigner_dir.encode())
            os.putenv('PAGESIGNER_TESTING_ON_FIREFOX', 'true')
            print('Starting Firefox')
            ffproc = subprocess.Popen([firefox_path, '--new-instance', '--profile', firefox_profile_dir])
    
        #LIsten for a sign from the backend that test passed/failed
        if not firefoxonly:
            chromevt = ThreadWithRetval(target=testing_verdict_thread, args=(11557,))
            chromevt.daemon = True
            chromevt.start()
        if not chromeonly:
            ffvt = ThreadWithRetval(target=testing_verdict_thread, args=(12557,))
            ffvt.daemon = True
            ffvt.start()
        if not firefoxonly:
            chromevt.join()
        if not chromeonly:
            ffvt.join()
        if ((chromevt.retval == 0 if not firefoxonly else True)and (ffvt.retval == 0 if not chromeonly else True)):
            cleanup_and_quit('test passed')
        else:
            print('Not exiting because there was an error')

    except KeyboardInterrupt:
        print ('Ctrl+C pressed')
        cleanup_and_quit('keyboard')
    
