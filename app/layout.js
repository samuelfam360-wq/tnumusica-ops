export const metadata = {
  title: "Play Studio Manager",
  description: "Studio management for Play Studio",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Play Studio" },
};

export const viewport = {
  themeColor: "#0F6E56",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body * { visibility: hidden; }
            .print-area, .print-area * { visibility: visible; }
            .modal-overlay {
              position: static !important; background: none !important;
              display: block !important; padding: 0 !important; inset: auto !important;
            }
            .modal-box {
              position: static !important; max-width: none !important; max-height: none !important;
              overflow: visible !important; box-shadow: none !important; border: none !important;
              width: 100% !important; padding: 0 !important; border-radius: 0 !important;
            }
            .print-area {
              position: static !important; width: 100% !important; max-width: 700px !important;
              margin: 0 auto !important; padding: 24px !important; box-shadow: none !important; border: none !important;
            }
            .no-print { display: none !important; }
          }
        `}} />
      </head>
      <body style={{ margin: 0, fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif", background: "#FAF7F2" }}>
        {children}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').catch(() => {});
            });
          }
        ` }} />
      </body>
    </html>
  );
}
