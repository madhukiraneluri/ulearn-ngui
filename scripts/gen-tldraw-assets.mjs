import fs from 'node:fs';

const svg = fs.readFileSync('public/tldraw/icons/0_merged.svg', 'utf8');
const ids = [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
const icons = Object.fromEntries(ids.map((id) => [id, `/tldraw/icons/0_merged.svg#${id}`]));

const out = `import type { TLUiAssetUrlOverrides } from '@tldraw/tldraw';

export const localTldrawAssetUrls: TLUiAssetUrlOverrides = {
  icons: ${JSON.stringify(icons, null, 2)} as TLUiAssetUrlOverrides['icons']
};
`;

fs.writeFileSync('src/app/public/session-join/session-whiteboard/tldraw-asset-urls.ts', out);
console.log(`Generated ${ids.length} icon asset URLs`);
