import { HttpContext } from '@adonisjs/core/http'
import City from '#models/city'

export default class CityController {
  async getCity({ request, response }: HttpContext) {
    const id: number = parseInt(request.param('id'))

    const city = await City.findOrFail(id)

    response.json(city)
  }

  async createCity({ request, response }: HttpContext) {
    const { department_code, insee_code, name, zip_code, lat, lon } = request.body()

    const city = await City.create({
      department_code: department_code,
      insee_code: insee_code,
      name: name,
      zip_code: zip_code,
      lat: lat,
      lon: lon,
    })

    if (city) {
      return response.json(city)
    } else {
      return response.status(500).json({ message: 'Error while creating city' })
    }
  }

  async getCities({ response }: HttpContext) {
    const cities = await City.all()

    return response.json(cities)
  }
}
