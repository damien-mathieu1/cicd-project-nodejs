import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cities'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('department_code', 5).nullable()
      table.string('insee_code', 5).nullable()
      table.string('zip_code', 5).nullable()
      table.string('name').nullable()
      table.decimal('lat', 10, 8).nullable()
      table.decimal('lon', 11, 8).nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
