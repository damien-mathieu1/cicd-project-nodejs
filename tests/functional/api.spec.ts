import { test } from '@japa/runner'

test.group('City API endpoints', () => {
  test('Health check endpoint returns 204', async ({ client }) => {
    const response = await client.get('/api/v1/health')
    response.assertStatus(204)
  })
})
