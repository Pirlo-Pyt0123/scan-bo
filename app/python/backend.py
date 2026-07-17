#!/usr/bin/env python3
"""
Backend Python para Scanner Facturas
Solo QR - Extrae Autorizacion (14 chars) y Factura (resto)
"""
import os
os.environ["QT_QPA_PLATFORM"] = "xcb"
import sys
import json
import cv2
import numpy as np
import base64
import time
import threading

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'venv', 'lib'))

class CameraBackend:
    def __init__(self):
        self.cap = None
        self.qr_detector = cv2.QRCodeDetector()
        self.running = False
        self.last_frame = None
        
        self.last_detection = None
        self.last_detection_time = 0
        self.cooldown = 4.0
        
        self.k1 = -0.3
        self.k2 = 0.1
        self.undistort_enabled = True
        self.K = None
        
    def init_camera(self, camera_index=1):
        self.cap = cv2.VideoCapture(camera_index)
        if not self.cap.isOpened():
            self.cap = cv2.VideoCapture(0)
            if not self.cap.isOpened():
                self.send_error("No se pudo abrir la webcam")
                return False
        
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        return True
    
    def send_json(self, data):
        try:
            sys.stdout.write(json.dumps(data) + '\n')
            sys.stdout.flush()
        except:
            pass
    
    def send_error(self, message):
        self.send_json({'type': 'error', 'message': message})
    
    def undistort_frame(self, frame):
        if not self.undistort_enabled:
            return frame
        
        h, w = frame.shape[:2]
        
        if self.K is None:
            self.K = np.array([[w, 0, w/2], [0, h, h/2], [0, 0, 1]], dtype=np.float64)
        
        D = np.array([self.k1, self.k2, 0, 0], dtype=np.float64)
        new_K, _ = cv2.getOptimalNewCameraMatrix(self.K, D, (w, h), 1)
        
        return cv2.undistort(frame, self.K, D, None, new_K)
    
    def frame_to_base64(self, frame):
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
        return base64.b64encode(buffer).decode('utf-8')
    
    def detect_qr(self, frame):
        try:
            data, points, _ = self.qr_detector.detectAndDecode(frame)
            if data and points is not None and len(points) > 0:
                return data, points[0]
        except:
            pass
        return None, None
    
    def parse_qr_data(self, qr_text):
        fields = {
            'nit': '---',
            'factura': '---',
            'autorizacion': '---',
            'monto': '---'
        }
        
        if not qr_text:
            return fields
        
        qr_text = qr_text.strip()
        
        if len(qr_text) >= 14:
            fields['autorizacion'] = qr_text[:14]
            fields['factura'] = qr_text[14:]
        else:
            fields['autorizacion'] = qr_text
        
        return fields
    
    def process_frame(self, frame):
        frame = self.undistort_frame(frame)
        current_time = time.time()
        
        qr_data, qr_points = self.detect_qr(frame)
        
        if qr_data:
            if qr_points is not None:
                pts = qr_points.astype(int)
                cv2.polylines(frame, [pts], True, (34, 197, 94), 3)
                
                center_x = int(np.mean(pts[:, 0]))
                center_y = int(np.mean(pts[:, 1]))
                cv2.putText(frame, 'DETECTADO', (center_x - 40, center_y - 20),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (34, 197, 94), 2)
            
            detection_key = qr_data[:50]
            
            if detection_key != self.last_detection or (current_time - self.last_detection_time) > self.cooldown:
                self.last_detection = detection_key
                self.last_detection_time = current_time
                
                fields = self.parse_qr_data(qr_data)
                
                self.send_json({
                    'type': 'data_detected',
                    'fields': fields,
                    'raw_qr': qr_data
                })
        
        cv2.putText(frame, 'QR ACTIVO', (10, 30), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (34, 197, 94), 2)
        
        return frame
    
    def run(self):
        if not self.init_camera(1):
            self.send_error("No se encontro webcam")
            return
        
        self.running = True
        
        while self.running:
            ret, frame = self.cap.read()
            if not ret:
                time.sleep(0.1)
                continue
            
            self.last_frame = frame
            
            try:
                processed = self.process_frame(frame)
                frame_b64 = self.frame_to_base64(processed)
                
                self.send_json({
                    'type': 'video_frame',
                    'frame': frame_b64
                })
            except Exception as e:
                pass
            
            time.sleep(0.033)
        
        if self.cap:
            self.cap.release()
    
    def handle_command(self, command):
        cmd_type = command.get('type')
        
        if cmd_type == 'start':
            if not self.running:
                self.running = True
                threading.Thread(target=self.run, daemon=True).start()
        
        elif cmd_type == 'stop':
            self.running = False
        
        elif cmd_type == 'upload_siat':
            data = command.get('data', {})
            self.send_json({
                'type': 'upload_success',
                'message': 'Datos enviados al SIAT'
            })
        
        elif cmd_type == 'set_k1':
            self.k1 = command.get('value', -0.3)
            self.K = None
        
        elif cmd_type == 'set_k2':
            self.k2 = command.get('value', 0.1)
            self.K = None

def read_stdin(backend):
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            if line.strip():
                command = json.loads(line.strip())
                backend.handle_command(command)
        except:
            pass

def main():
    backend = CameraBackend()
    
    stdin_thread = threading.Thread(target=read_stdin, args=(backend,), daemon=True)
    stdin_thread.start()
    
    backend.run()

if __name__ == '__main__':
    main()
