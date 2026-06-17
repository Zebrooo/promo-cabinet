import './globals.css';
import '@zebrooo/promo-renderer/styles.css';
import type { ReactNode } from 'react';
import { Manrope, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import { ErrorListeners } from '@/components/ErrorListeners';

const sans = Manrope({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata = {
  title: 'Промо-кабинет',
  description: 'Список и очередь промо · S3-каталог',
};

const YM_ID = process.env.NEXT_PUBLIC_YM_COUNTER_ID;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <ErrorListeners />
        {YM_ID && (
          <Script id="ym-init" strategy="afterInteractive">
            {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");
ym(${YM_ID},"init",{id:${YM_ID},clickmap:true,webvisor:true,accurateTrackBounce:true,trackLinks:true});`}
          </Script>
        )}
        {children}
      </body>
    </html>
  );
}
