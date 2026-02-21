"use client"

import Script from "next/script"

const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID

/**
 * Microsoft Clarity: session recordings and heatmaps for UX improvement.
 * Only loads when NEXT_PUBLIC_CLARITY_PROJECT_ID is set (e.g. in Vercel env).
 * Get your project ID at https://clarity.microsoft.com
 */
export function MSClarity() {
	if (!CLARITY_ID) return null

	return (
		<Script
			id="ms-clarity"
			strategy="afterInteractive"
			dangerouslySetInnerHTML={{
				__html: `
(function(c,l,a,r,i,t,y){
  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${CLARITY_ID}");
`,
			}}
		/>
	)
}
