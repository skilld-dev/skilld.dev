/** Browser preview styles. Unknown email styles keep their inline fallback. */
const styles = [
  'width:100%;max-width:600px;background:var(--email-surface);border:1px solid var(--email-border);border-radius:8px;',
  'padding:22px 20px 26px;',
  'border-bottom:1px solid var(--email-border);padding-bottom:14px;',
  'vertical-align:middle;',
  'font-family:\'IBM Plex Mono\',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;color:var(--email-faint);font-variant-numeric:tabular-nums;',
  'padding:22px 0 8px;',
  'margin:0;font-family:\'Plus Jakarta Sans\',-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:600;line-height:1.35;color:var(--email-text);',
  'margin-top:6px;font-family:\'Plus Jakarta Sans\',-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:var(--email-body);',
  'padding:28px 0 10px;',
  'margin:0;font-family:\'IBM Plex Mono\',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;line-height:1.5;letter-spacing:0.08em;text-transform:uppercase;color:var(--email-faint);',
  'padding:14px 0;border-top:1px solid var(--email-border);',
  'width:44px;padding-right:12px;',
  'width:36px;height:36px;border-radius:18px;display:block;border:1px solid var(--email-border);background:var(--email-quote);',
  'display:inline-block;padding:0 0 3px;font-family:\'IBM Plex Mono\',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:15px;line-height:1.45;font-weight:600;color:var(--email-text);text-decoration:underline;text-decoration-color:var(--email-borderStrong);text-underline-offset:3px;',
  'margin-top:6px;',
  'width:16px;font-family:\'IBM Plex Mono\',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;line-height:1.55;color:var(--email-faint);',
  'font-family:\'IBM Plex Mono\',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;line-height:1.55;color:var(--email-body);',
  'margin-top:8px;font-family:\'IBM Plex Mono\',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;line-height:1.55;color:var(--email-muted);font-variant-numeric:tabular-nums;',
  'margin-top:4px;font-family:\'IBM Plex Mono\',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;line-height:20px;',
  'display:inline-block;padding:12px 12px 12px 0;color:var(--email-accent);text-decoration:underline;text-underline-offset:3px;',
  'padding:16px 20px 20px;border-top:1px solid var(--email-border);font-family:\'IBM Plex Mono\',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;line-height:1.7;color:var(--email-faint);',
  'display:inline-block;padding:12px 0;color:var(--email-muted);text-decoration:underline;text-underline-offset:3px;',
  'width:4px;height:4px;padding:0;font-size:0;line-height:0;',
  'width:4px;height:4px;padding:0;border-radius:2px;background:var(--email-body);font-size:0;line-height:0;',
  'width:4px;height:4px;padding:0;border-radius:2px;background:var(--email-borderStrong);font-size:0;line-height:0;',
  'padding:10px 0;border-top:1px solid var(--email-border);',
  'width:30px;padding-top:5px;font-family:\'IBM Plex Mono\',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.45;color:var(--email-muted);font-variant-numeric:tabular-nums;',
  'width:36px;padding-right:10px;',
  'width:28px;height:28px;border-radius:14px;display:block;border:1px solid var(--email-border);background:var(--email-quote);',
  'overflow-wrap:anywhere;',
  'display:inline-block;padding:0 0 3px;font-family:\'IBM Plex Mono\',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;line-height:1.45;font-weight:600;color:var(--email-text);text-decoration:underline;text-decoration-color:var(--email-borderStrong);text-underline-offset:3px;',
  'padding-left:12px;white-space:nowrap;',
  'white-space:nowrap;font-family:\'IBM Plex Mono\',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;line-height:1.45;color:var(--email-muted);font-variant-numeric:tabular-nums;',
  'display:inline-table;vertical-align:middle;margin-right:6px;',
  'margin-top:3px;font-family:\'Plus Jakarta Sans\',-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:var(--email-body);',
] as const

const classes = new Map<string, string>(styles.map((style, index) => [style, `wp${index}`]))

export const weeklyPreviewCss = styles.map((style, index) => `.weekly-preview .wp${index}{${style}}`).join('')

/** Share repeated browser styles while preserving every email element and attribute. */
export function compactWeeklyPreview(card: string): string {
  return card.replace(/<([a-z][\w-]*)\b([^<>]*?)\sstyle="([^"]*)"([^<>]*)>/gi, (tag, name: string, before: string, style: string, after: string) => {
    const className = classes.get(style)
    if (!className)
      return tag
    const selfClosing = /\/\s*$/.test(after)
    const attributes = `${before}${after.replace(/\/\s*$/, '')}`
    const styled = /\bclass="[^"]*"/.test(attributes)
      ? attributes.replace(/\bclass="([^"]*)"/, (_match, value: string) => `class="${value} ${className}"`)
      : `${attributes} class="${className}"`
    return `<${name}${styled}${selfClosing ? ' /' : ''}>`
  })
}
