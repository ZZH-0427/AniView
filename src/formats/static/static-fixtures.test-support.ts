const fixtures = import.meta.glob<string>('../../../tests/fixtures/static/*.{jpg,png,webp}', {
  eager: true, query: '?inline', import: 'default',
})

export function staticFixture(name: string): ArrayBuffer {
  const encoded = fixtures[`../../../tests/fixtures/static/${name}`]?.split(',')[1]
  if (!encoded) throw new Error(`Unknown static fixture: ${name}`)
  return Uint8Array.from(atob(encoded), character => character.charCodeAt(0)).buffer
}
