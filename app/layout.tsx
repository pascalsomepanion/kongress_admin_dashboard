import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kongress für Sportmedizin — Anmeldung',
  description: 'Internationaler Kongress für Sportmedizin, St. Christoph am Arlberg',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="antialiased">{children}</body>
    </html>
  )
}
