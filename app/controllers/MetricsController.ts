import type { HttpContext } from '@adonisjs/core/http'
import PrometheusService from '#services/prometheus'

const prometheusService = new PrometheusService()

export default class MetricsController {
  public async index({ response }: HttpContext) {
    prometheusService.updateMetrics()

    const metrics = await prometheusService.getMetrics()

    response.header('Content-Type', 'text/plain')
    return response.send(metrics)
  }
}
