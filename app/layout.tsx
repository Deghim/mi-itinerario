import type { Metadata } from 'next'
import 'leaflet/dist/leaflet.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'São Paulo · Mi itinerario',
  description: 'Un atlas personal para organizar el viaje a São Paulo.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
