import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('la exportación de Pages incluye la base del repo y recursos estáticos', async () => {
  const html = await readFile(new URL('../../out/index.html', import.meta.url), 'utf8')
  assert.match(html, process.env.EXPECT_PAGES_BASE_PATH === 'true' ? /\/mi-itinerario\/_next\/static\// : /(?:\/mi-itinerario)?\/_next\/static\//)
  assert.match(html, /Llegada a São Paulo|São Paulo/)
  const notFound = await readFile(new URL('../../out/404.html', import.meta.url), 'utf8')
  assert.ok(notFound.length > 100)
})
