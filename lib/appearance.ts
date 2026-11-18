/** A guest keeps the same appearance without needing an account profile or a customizer. */
export type HairStyle = 'crop' | 'part' | 'waves' | 'bob' | 'curly' | 'pony' | 'half-up' | 'bun';
export type AvatarAppearance = {
  preset: number;
  hairStyle: HairStyle;
  skin: string;
  hair: string;
  jacket: string;
  accent: string;
  trousers: string;
  shoes: string;
};
export const AVATAR_HEIGHT = 1.38;
export const AVATAR_HAND_SPAN = 1.76;
const HAIR_STYLES: HairStyle[] = ['crop', 'part', 'waves', 'bob', 'curly', 'pony', 'half-up', 'bun'];
const SKIN = ['#eac0a2', '#d5a181', '#bb896d', '#98674e', '#754d3e', '#efccb5'];
const HAIR = ['#352b27', '#5c3d2d', '#814e36', '#372a29', '#8e6445', '#262b30'];
const JACKETS = ['#93b5a4', '#d6ae79', '#83a6bd', '#c98f83', '#b8abd0', '#d8ceb5', '#80988c', '#b9976f'];
const ACCENTS = ['#f0e7ce', '#dfc3a0', '#e5dfd3', '#bfcfbe', '#d6dcea', '#e5d4c0'];
export function appearanceHash(seed: string): number {
  let value = 2166136261;
  for (let i = 0; i < seed.length; i++) value = Math.imul(value ^ seed.charCodeAt(i), 16777619);
  return value >>> 0;
}
export function appearanceFor(seed: string): AvatarAppearance {
  const at = (suffix: string) => appearanceHash(`${seed}:${suffix}`);
  const preset = at('silhouette') % HAIR_STYLES.length;
  return {
    preset,
    hairStyle: HAIR_STYLES[preset],
    skin: SKIN[at('skin') % SKIN.length],
    hair: HAIR[at('hair') % HAIR.length],
    jacket: JACKETS[at('jacket') % JACKETS.length],
    accent: ACCENTS[at('accent') % ACCENTS.length],
    trousers: ['#425161', '#56606a', '#645e53', '#4a5b55'][at('trousers') % 4],
    shoes: ['#b4906c', '#c2ad8b', '#9a8270', '#d1bba0'][at('shoes') % 4],
  };
}
