# scan-bo

Aplicacion de escritorio para escaneo de codigos QR de facturas.  
Extrae Numero de Autorizacion y Numero de Factura automaticamente.

## Tecnologias

- **Electron** - Interfaz de escritorio
- **Python** - Deteccion de QR con OpenCV
- **Tema light** - Claymorphism

## Estructura

```
scan-bo/
├── app/
│   ├── src/
│   │   ├── index.html      # Interfaz principal
│   │   ├── main.js         # Proceso principal Electron
│   │   ├── renderer.js     # Logica frontend
│   │   └── styles.css      # Estilos
│   ├── python/
│   │   └── backend.py      # Backend QR
│   └── package.json
├── .gitignore
├── README.md
└── requirements.txt
```

## Instalacion

### Backend Python

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Frontend Electron

```bash
cd app
pnpm install
```

## Ejecucion

```bash
cd app
pnpm start
```

## Campos extraidos del QR

| Campo | Fuente |
|-------|--------|
| No. Autorizacion | Primeros 14 caracteres del QR |
| No. Factura | Resto del contenido del QR |
| NIT | Manual (editable) |
| Monto | Manual |

## Pendiente

- [ ] Integracion con SIAT (Playwright)
- [ ] Campo NIT automatico
- [ ] Campo Monto automatico
