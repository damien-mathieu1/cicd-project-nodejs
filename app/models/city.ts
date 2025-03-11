import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class City extends BaseModel {

  static table = 'cities'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare department_code: string

  @column()
  declare insee_code: string

  @column()
  declare zip_code: string

  @column()
  declare name: string

  @column()
  declare lat: number

  @column()
  declare  lon: number
}
