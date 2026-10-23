import composition from '../../../tests/fixtures/apng/composition.png?inline'
import delays from '../../../tests/fixtures/apng/delays.png?inline'
import firstPrevious from '../../../tests/fixtures/apng/first-previous.png?inline'
import fullFinite from '../../../tests/fixtures/apng/full-finite.png?inline'
import fullInfinite from '../../../tests/fixtures/apng/full-infinite.png?inline'
import hiddenDefault from '../../../tests/fixtures/apng/hidden-default.png?inline'
import longBounded from '../../../tests/fixtures/apng/long-bounded.png?inline'
import staticPNG from '../../../tests/fixtures/apng/static.png?inline'

const fixtures: Record<string, string> = {
  'composition.png': composition, 'delays.png': delays, 'first-previous.png': firstPrevious,
  'full-finite.png': fullFinite, 'full-infinite.png': fullInfinite, 'hidden-default.png': hiddenDefault,
  'long-bounded.png': longBounded, 'static.png': staticPNG,
}

/** Vite inlines the committed binary fixtures; application TS keeps browser-only globals. */
export function apngFixture(name: string): ArrayBuffer {
  const encoded = fixtures[name]?.split(',')[1]
  if (!encoded) throw new Error(`Unknown inline fixture: ${name}`)
  return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0)).buffer
}
