import { Registry, Gauge } from 'prom-client'

export default class PrometheusService {
  private register: Registry
  private gauge: Gauge

  constructor() {
    this.register = new Registry()

    // Define a gauge metric
    this.gauge = new Gauge({
      name: 'example_gauge',
      help: 'Example gauge metric',
    })

    // Register the gauge
    this.register.registerMetric(this.gauge)
  }

  /**
   * Updates the gauge value with a random number
   */
  public updateMetrics(): void {
    this.gauge.set(Math.random() * 100)
  }

  /**
   * Returns the current metrics as a string
   */
  async getMetrics(): Promise<string> {
    return this.register.metrics()
  }
}
