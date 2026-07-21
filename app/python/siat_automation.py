#!/usr/bin/env python3
import sys
import json
import time
import os
import shutil
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from webdriver_manager.firefox import GeckoDriverManager

os.environ['QT_QPA_PLATFORM'] = 'xcb'

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

        firefox_path = shutil.which('firefox') or shutil.which('firefox-esr')
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

        send_json({'type': 'progress', 'step': 'login', 'message': 'Iniciando sesión en SIAT...', 'current': 0, 'total': len(invoices)})

        driver.get('https://siat.impuestos.gob.bo/')

        long.until(EC.presence_of_element_located((By.ID, 'nitCur')))
        driver.find_element(By.ID, 'nitCur').send_keys(credentials.get('identity', ''))
        driver.find_element(By.ID, 'email').send_keys(credentials.get('email', ''))
        driver.find_element(By.ID, 'password').send_keys(credentials.get('password', ''))
        driver.find_element(By.ID, 'kc-login').click()

        # Si el login funciona, el SIAT navega fuera de la pantalla de login y
        # el boton 'kc-login' deja de estar presente/visible. Si las
        # credenciales son incorrectas, Keycloak vuelve a mostrar el mismo
        # formulario con un error, asi que el boton sigue ahi.
        try:
            WebDriverWait(driver, 8).until(
                EC.invisibility_of_element_located((By.ID, 'kc-login'))
            )
        except TimeoutException:
            send_json({'type': 'error', 'message': 'No se pudo iniciar sesion en el SIAT. Verifica tu NIT/CI, correo y contraseña.'})
            return

        send_json({'type': 'progress', 'step': 'navigate', 'message': 'Buscando Aplicaciones...', 'current': 0, 'total': len(invoices)})

        ok = retry_click(long, By.XPATH, "//button[@mattooltip='Aplicaciones']", attempts=3, delay=2)
        if not ok:
            ok = retry_click(long, By.XPATH, "//*[contains(text(), 'Aplicaciones')]", attempts=2, delay=2)
        if not ok:
            send_json({'type': 'error', 'message': 'No se encontró el botón Aplicaciones'})
            return

        time.sleep(1.5)

        send_json({'type': 'progress', 'step': 'navigate', 'message': 'Abriendo Sistema de Facturación...', 'current': 0, 'total': len(invoices)})

        ok = retry_click(long, By.XPATH, "//*[contains(text(), 'Sistema de Facturación') or contains(text(), 'Sistema de Facturacion')]", attempts=3, delay=2)
        if not ok:
            send_json({'type': 'error', 'message': 'No se encontró Sistema de Facturación'})
            return

        time.sleep(1)

        send_json({'type': 'progress', 'step': 'navigate', 'message': 'Buscando Registro de Compras y Ventas...', 'current': 0, 'total': len(invoices)})

        ok = retry_click(long, By.XPATH, "//*[contains(text(), 'Registro de Compras y Ventas')]", attempts=3, delay=2)
        if not ok:
            send_json({'type': 'error', 'message': 'No se encontró Registro de Compras y Ventas'})
            return

        try:
            long.until(lambda d: 'rvcc' in d.current_url)
        except:
            pass
        time.sleep(2)

        send_json({'type': 'progress', 'step': 'navigate', 'message': 'Abriendo COMPRAS en el menú lateral...', 'current': 0, 'total': len(invoices)})

        ok = retry_click(long, By.XPATH, "//aside[contains(@class,'sidebar')]//span[text()='COMPRAS']/ancestor::a", attempts=3, delay=2)
        if not ok:
            send_json({'type': 'error', 'message': 'No se encontró menú COMPRAS en sidebar'})
            return

        time.sleep(1)

        send_json({'type': 'progress', 'step': 'navigate', 'message': 'Abriendo Registro de Compras...', 'current': 0, 'total': len(invoices)})

        ok = retry_click(long, By.XPATH, "//a[contains(@href, 'RegistrarComprasContribuyente')]", attempts=3, delay=2)
        if not ok:
            ok = retry_click(long, By.XPATH, "//*[contains(text(), 'Registro de Compras')]", attempts=2, delay=2)
        if not ok:
            send_json({'type': 'error', 'message': 'No se encontró Registro de Compras'})
            return

        time.sleep(2)

        send_json({'type': 'progress', 'step': 'buscar', 'message': 'Buscando...', 'current': 0, 'total': len(invoices)})

        ok = retry_click(long, By.ID, 'formPrincipal:idBuscar', attempts=3, delay=2)
        if not ok:
            ok = retry_click(long, By.XPATH, "//*[contains(text(), 'Buscar')]", attempts=2, delay=2)
        if not ok:
            send_json({'type': 'error', 'message': 'No se encontró botón Buscar'})
            return

        time.sleep(1)

        retry_click(long, By.XPATH, "//*[contains(text(), 'Nuevo Registro') or contains(text(), 'Nuevo')]", attempts=3, delay=2)
        time.sleep(1)

        send_json({'type': 'progress', 'step': 'navigate', 'message': f'Listo para {len(invoices)} facturas', 'current': 0, 'total': len(invoices)})

        for i, inv in enumerate(invoices):
            send_json({
                'type': 'progress',
                'step': 'filling',
                'message': f'Factura {i+1}/{len(invoices)}: {inv.get("factura", "")}',
                'current': i + 1,
                'total': len(invoices)
            })

            fields = {
                'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtNitProveedor': inv.get('nit', ''),
                'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtCodAutorizacion': inv.get('autorizacion', ''),
                'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtNroFactura': inv.get('factura', ''),
                'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtNroDui': '0',
                'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtFechaFactura': time.strftime('%d'),
                'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtMontoTotal_input': inv.get('monto', '0'),
                'formPrincipal:tabRegistroCompras:cmpComprasDT:cfacturaNueva:txtCodControl': '0-0-0',
            }

            for field_id, value in fields.items():
                try:
                    el = driver.find_element(By.ID, field_id)
                    el.clear()
                    el.send_keys(str(value))
                except:
                    pass

            send_json({
                'type': 'progress',
                'step': 'waiting',
                'message': f'Esperando 3s...',
                'current': i + 1,
                'total': len(invoices)
            })

            time.sleep(3)

            for field_id in fields:
                try:
                    driver.find_element(By.ID, field_id).clear()
                except:
                    pass

            time.sleep(0.5)

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
