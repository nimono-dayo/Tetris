#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from socketserver import StreamRequestHandler

class TimeoutHTTPRequestHandler(SimpleHTTPRequestHandler):
    def setup(self):
        StreamRequestHandler.timeout = 60
        StreamRequestHandler.setup(self)

if __name__ == '__main__':
    PORT = 5000
    HOST = '0.0.0.0'
    
    with ThreadingHTTPServer((HOST, PORT), TimeoutHTTPRequestHandler) as server:
        server.timeout = 60
        print(f"Server running at http://{HOST}:{PORT}/")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down...")
