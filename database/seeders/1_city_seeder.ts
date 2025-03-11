import {BaseSeeder} from "@adonisjs/lucid/seeders";
import app from "@adonisjs/core/services/app";
import * as fs from "node:fs";
import City from "#models/city";

export default class extends BaseSeeder {
  async run() {
    const filePath = app.publicPath('cities.json')
    const citiesData = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    await City.createMany(citiesData)
  }
}
