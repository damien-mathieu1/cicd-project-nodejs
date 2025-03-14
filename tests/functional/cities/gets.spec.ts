import { test } from '@japa/runner'
import City from "#models/city";
import db from "@adonisjs/lucid/services/db";

test.group('Cities gets', (group) => {
  group.each.setup(async () => {
    await db.beginGlobalTransaction()
    return () => db.rollbackGlobalTransaction()
  })

  test('Get a city', async ({ client, assert }) => {

    const city_added = await City.create({
      department_code: '667',
      insee_code: '92i',
      name:'La cité du test',
      zip_code: '75000',
      lat: 48.8566,
      lon: 2.3522
    })

    const res = await client
      .get(`/api/v1/city/${city_added.id}`)

    assert.isTrue(199 < res.status() && res.status() < 300)
    assert.isTrue(res.body().departmentCode === '667')

  })

  test('Get all cities', async ({ client }) => {
    await City.createMany([
      {
        department_code: '75',
        insee_code: '75056',
        name: 'Paris',
        zip_code: '75000',
        lat: 48.8566,
        lon: 2.3522,
      },
      {
        department_code: '69',
        insee_code: '69123',
        name: 'Lyon',
        zip_code: '69000',
        lat: 45.764,
        lon: 4.8357,
      },
    ])

    const response = await client.get('/api/v1/cities')

    response.assertStatus(200)
    response.assertBodyContains([{ name: 'Paris' }, { name: 'Lyon' }])
  })
})
