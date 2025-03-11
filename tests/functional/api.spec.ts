import { test } from '@japa/runner'
import City from '#models/city'
import db from '@adonisjs/lucid/services/db'

test.group('City API endpoints', (group) => {
  group.each.setup(async () => {
    await db.beginGlobalTransaction()
    return () => db.rollbackGlobalTransaction()
  })

  test('get city by id', async ({ client }) => {
    const city = await City.create({
      department_code: '75',
      insee_code: '75056',
      name: 'Paris',
      zip_code: '75000',
      lat: 45.764,
      lon: 4.8357,
    })

    const response = await client.get(`/api/v1/city/${city.id}`)

    response.assertStatus(200)
    response.assertBodyContains({
      id: city.id,
      name: 'Paris',
      departmentCode: '75',
      inseeCode: '75056',
      zipCode: '75000',
    })
  })

  test('create new city', async ({ client }) => {
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

  test('get all cities', async ({ client }) => {
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

  test('health check endpoint returns 204', async ({ client }) => {
    const response = await client.get('/api/v1/_health')
    response.assertStatus(204)
  })
})
