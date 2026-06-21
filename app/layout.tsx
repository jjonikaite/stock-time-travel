import './globals.css'
import React from 'react'
import Header from '../components/Header'

export const metadata = {
  title: 'Stock Time Travel Simulator',
  description: 'Premium Stock Time Travel dashboard'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="lt" className="scroll-smooth">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <Header />
        <main className="container py-8">{children}</main>
      </body>
    </html>
  )
}
