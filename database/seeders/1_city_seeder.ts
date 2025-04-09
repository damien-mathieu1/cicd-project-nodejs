import {BaseSeeder} from "@adonisjs/lucid/seeders";
import app from "@adonisjs/core/services/app";
import * as fs from "node:fs";
import City from "#models/city";

export default class extends BaseSeeder {
  async run() {
    const filePath = app.publicPath('cities.json')
    const citiesData = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    let parsedCities: any[] = []
    for (const cityData of citiesData) {
      parsedCities.push({
        department_code: cityData.department_code,
        insee_code: cityData.insee_code,
        name: cityData.name,
        zip_code: cityData.zip_code,
        lat: cityData.lat,
        lon: cityData.lon
      })
    }
    await City.createMany(parsedCities)
  }
}
