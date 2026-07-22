#!/usr/bin/env python3
import sys
import json
import time
import os
import shutil
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from webdriver_manager.firefox import GeckoDriverManager

if sys.platform.startswith('linux'):
    os.environ.setdefault('QT_QPA_PLATFORM', 'xcb')

def find_firefox():
    found = shutil.which('firefox') or shutil.which('firefox-esr')
    if found:
        return found

    if sys.platform == 'win32':
        # El instalador de Firefox en Windows no lo agrega al PATH, asi que
        # shutil.which no lo encuentra aunque este instalado. Probamos las
        # ubicaciones tipicas.
        candidates = []
        for env_var in ('PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA'):
            base = os.environ.get(env_var)
            if base:
                candidates.append(os.path.join(base, 'Mozilla Firefox', 'firefox.exe'))
        for path in candidates:
            if os.path.isfile(path):
                return path

    elif sys.platform == 'darwin':
        mac_path = '/Applications/Firefox.app/Contents/MacOS/firefox'
        if os.path.isfile(mac_path):
            return mac_path

    return None

def send_json(data):
    try:
        sys.stdout.write(json.dumps(data) + '\n')
        sys.stdout.flush()
    except:
        pass

def retry_click(wait_obj, by, selector, attempts=3, delay=2):
    for attempt in range(attempts):
        try:
            el = wait_obj.until(EC.presence_of_element_located((by, selector)))
            driver_ref = wait_obj._driver
            driver_ref.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
            time.sleep(0.3)
            driver_ref.execute_script("arguments[0].click();", el)
            return True
        except:
            if attempt < attempts - 1:
                time.sleep(delay)
    return False

def fill_field(driver, field_id, value):
    try:
        el = driver.find_element(By.ID, field_id)
        el.clear()
        el.send_keys(str(value))
        return True
    except:
        return False

def click_adicionar(driver, long):
    btn = long.until(
        EC.element_to_be_clickable((By.ID, 'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:btnVerificarCompra'))
    )
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", btn)
    time.sleep(0.3)
    driver.execute_script("arguments[0].click();", btn)

def read_toast(driver, timeout=8):
    try:
        toast = WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '.toast'))
        )
        title_el = toast.find_element(By.CSS_SELECTOR, '.toast-title')
        msg_el = toast.find_element(By.CSS_SELECTOR, '.toast-message')
        title = title_el.text.strip()
        message = msg_el.text.strip()
        return title, message
    except:
        return None, None

def close_dialog_if_open(driver):
    try:
        cerrar = driver.find_element(By.ID, 'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:cerrar2')
        if cerrar.is_displayed():
            driver.execute_script("arguments[0].click();", cerrar)
            time.sleep(1)
    except:
        pass

def main():

    line = sys.stdin.readline()
    if not line:
        send_json({'type': 'error', 'message': 'No se recibieron datos'})
        return

    command = json.loads(line.strip())
    credentials = command.get('credentials', {})
    invoices = command.get('invoices', [])

    if not credentials:
        send_json({'type': 'error', 'message': 'No hay credenciales'})
        return

    driver = None
    try:
        send_json({'type': 'progress', 'step': 'login', 'message': 'Iniciando Firefox...', 'current': 0, 'total': len(invoices)})

        firefox_path = find_firefox()
        if not firefox_path:
            send_json({'type': 'error', 'message': 'No se encontro Firefox instalado en este equipo. Es necesario para subir facturas al SIAT.'})
            return

        options = Options()
        options.add_argument('--private')
        options.binary_location = firefox_path

        service = Service(GeckoDriverManager().install())
        driver = webdriver.Firefox(service=service, options=options)
        driver.set_window_size(1920, 1080)
        long = WebDriverWait(driver, 25)

        send_json({'type': 'progress', 'step': 'login', 'message': 'Iniciando sesion en SIAT...', 'current': 0, 'total': len(invoices)})

        driver.get('https://siat.impuestos.gob.bo/')

        long.until(EC.presence_of_element_located((By.ID, 'nitCur')))
        driver.find_element(By.ID, 'nitCur').send_keys(credentials.get('identity', ''))
        driver.find_element(By.ID, 'email').send_keys(credentials.get('email', ''))
        driver.find_element(By.ID, 'password').send_keys(credentials.get('password', ''))
        driver.find_element(By.ID, 'kc-login').click()

        try:
            WebDriverWait(driver, 8).until(
                EC.invisibility_of_element_located((By.ID, 'kc-login'))
            )
        except TimeoutException:
            send_json({'type': 'error', 'message': 'No se pudo iniciar sesion en el SIAT. Verifica tu NIT/CI, correo y contrasena.'})
            return

        send_json({'type': 'progress', 'step': 'navigate', 'message': 'Buscando Aplicaciones...', 'current': 0, 'total': len(invoices)})

        ok = retry_click(long, By.XPATH, "//button[@mattooltip='Aplicaciones']", attempts=3, delay=2)
        if not ok:
            ok = retry_click(long, By.XPATH, "//*[contains(text(), 'Aplicaciones')]", attempts=2, delay=2)
        if not ok:
            send_json({'type': 'error', 'message': 'No se encontro el boton Aplicaciones'})
            return

        time.sleep(1.5)

        send_json({'type': 'progress', 'step': 'navigate', 'message': 'Abriendo Sistema de Facturacion...', 'current': 0, 'total': len(invoices)})

        ok = retry_click(long, By.XPATH, "//*[contains(text(), 'Sistema de Facturación') or contains(text(), 'Sistema de Facturacion')]", attempts=3, delay=2)
        if not ok:
            send_json({'type': 'error', 'message': 'No se encontro Sistema de Facturacion'})
            return

        time.sleep(1)

        send_json({'type': 'progress', 'step': 'navigate', 'message': 'Buscando Registro de Compras y Ventas...', 'current': 0, 'total': len(invoices)})

        ok = retry_click(long, By.XPATH, "//*[contains(text(), 'Registro de Compras y Ventas')]", attempts=3, delay=2)
        if not ok:
            send_json({'type': 'error', 'message': 'No se encontro Registro de Compras y Ventas'})
            return

        try:
            long.until(lambda d: 'rvcc' in d.current_url)
        except:
            pass
        time.sleep(2)

        send_json({'type': 'progress', 'step': 'navigate', 'message': 'Abriendo COMPRAS en el menu lateral...', 'current': 0, 'total': len(invoices)})

        ok = retry_click(long, By.XPATH, "//aside[contains(@class,'sidebar')]//span[text()='COMPRAS']/ancestor::a", attempts=3, delay=2)
        if not ok:
            send_json({'type': 'error', 'message': 'No se encontro menu COMPRAS en sidebar'})
            return

        time.sleep(1)

        send_json({'type': 'progress', 'step': 'navigate', 'message': 'Abriendo Registro de Compras...', 'current': 0, 'total': len(invoices)})

        ok = retry_click(long, By.XPATH, "//a[contains(@href, 'RegistrarComprasContribuyente')]", attempts=3, delay=2)
        if not ok:
            ok = retry_click(long, By.XPATH, "//*[contains(text(), 'Registro de Compras')]", attempts=2, delay=2)
        if not ok:
            send_json({'type': 'error', 'message': 'No se encontro Registro de Compras'})
            return

        time.sleep(2)

        send_json({'type': 'progress', 'step': 'buscar', 'message': 'Buscando...', 'current': 0, 'total': len(invoices)})

        ok = retry_click(long, By.ID, 'formPrincipal:idBuscar', attempts=3, delay=2)
        if not ok:
            ok = retry_click(long, By.XPATH, "//*[contains(text(), 'Buscar')]", attempts=2, delay=2)
        if not ok:
            send_json({'type': 'error', 'message': 'No se encontro boton Buscar'})
            return

        time.sleep(1)

        send_json({'type': 'progress', 'step': 'navigate', 'message': f'Listo para {len(invoices)} facturas', 'current': 0, 'total': len(invoices)})

        today_day = datetime.now().strftime('%d')

        for i, inv in enumerate(invoices):
            send_json({
                'type': 'progress',
                'step': 'navigate',
                'message': f'Abrir nuevo registro {i+1}/{len(invoices)}: {inv.get("factura", "")}',
                'current': i + 1,
                'total': len(invoices)
            })

            ok = retry_click(long, By.XPATH, "//*[contains(text(), 'Nuevo Registro') or contains(text(), 'Nuevo')]", attempts=3, delay=2)
            if not ok:
                send_json({'type': 'error', 'message': f'No se pudo abrir Nuevo Registro para factura {i+1}'})
                return
            time.sleep(1.5)

            factura_web = inv.get('factura', '').lstrip('0') or '0'

            fill_field(driver, 'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtNitProveedor', inv.get('nit', ''))
            fill_field(driver, 'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtCodAutorizacion', inv.get('autorizacion', ''))
            fill_field(driver, 'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtNroFactura', factura_web)
            fill_field(driver, 'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtNroDui', '0')
            fill_field(driver, 'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtFechaFactura', today_day)
            fill_field(driver, 'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtMontoTotal_input', inv.get('monto', '0'))
            fill_field(driver, 'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtMontoIce_input', '0')
            fill_field(driver, 'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtMontoIehd_input', '0')
            fill_field(driver, 'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtMontoIpj_input', '0')
            fill_field(driver, 'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtMontoTasas_input', '0')
            fill_field(driver, 'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtMontoOtrosNS_input', '0')
            fill_field(driver, 'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtMontoExentas_input', '0')
            fill_field(driver, 'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtMontoTasaCero_input', '0')
            fill_field(driver, 'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtDescuentos_input', '0')
            fill_field(driver, 'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtGiftCard_input', '0')
            fill_field(driver, 'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtCodControl', '0-0-0')

            send_json({
                'type': 'progress',
                'step': 'submitting',
                'message': f'Enviando factura {i+1}/{len(invoices)}...',
                'current': i + 1,
                'total': len(invoices)
            })

            time.sleep(0.5)

            try:
                click_adicionar(driver, long)
            except Exception as e:
                send_json({
                    'type': 'invoice_result',
                    'factura': inv.get('factura', ''),
                    'autorizacion': inv.get('autorizacion', ''),
                    'status': 'Invalid',
                    'message': f'Error al hacer clic en Adicionar: {str(e)}'
                })
                close_dialog_if_open(driver)
                continue

            toast_title, toast_message = read_toast(driver, timeout=10)

            if toast_title and 'exitoso' in toast_title.lower():
                send_json({
                    'type': 'invoice_result',
                    'factura': inv.get('factura', ''),
                    'autorizacion': inv.get('autorizacion', ''),
                    'status': 'OK',
                    'message': toast_message or ''
                })
            else:
                error_msg = toast_message or toast_title or 'Error desconocido'
                status = 'Duplicated' if toast_message and 'ya se encuentra registrada' in toast_message.lower() else 'Invalid'
                send_json({
                    'type': 'invoice_result',
                    'factura': inv.get('factura', ''),
                    'autorizacion': inv.get('autorizacion', ''),
                    'status': status,
                    'message': error_msg
                })

            close_dialog_if_open(driver)

        send_json({
            'type': 'progress',
            'step': 'done',
            'message': f'{len(invoices)} facturas procesadas',
            'current': len(invoices),
            'total': len(invoices)
        })

        send_json({'type': 'success'})

    except Exception as e:
        send_json({'type': 'error', 'message': str(e)})
    finally:
        if driver:
            try:
                time.sleep(1)
                driver.quit()
            except:
                pass

if __name__ == '__main__':
    main()
