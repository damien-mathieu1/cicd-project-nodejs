import { test } from '@japa/runner'
import City from "#models/city";
import db from "@adonisjs/lucid/services/db";

test.group('Cities posts', (group) => {
  group.each.setup(async () => {
    await db.beginGlobalTransaction()
    return () => db.rollbackGlobalTransaction()
  })

  test('Create new city', async ({ client }) => {
    const cityData = {
      department_code: '69',
      insee_code: '69123',
      name: 'Lyon',
      zip_code: '69000',
      lat: 45.764,
      lon: 4.8357,
    }

    const response = await client.post('/api/v1/city').json(cityData)

    response.assertStatus(200)
    response.assertBodyContains({
      name: 'Lyon',
      departmentCode: '69',
      inseeCode: '69123',
    })

    const city = await City.findBy('insee_code', '69123')
    if (!city) throw new Error('City was not created in the database')
  })
})
