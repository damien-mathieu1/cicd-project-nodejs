import { HttpContext } from '@adonisjs/core/http'
import router from '@adonisjs/core/services/router'
import CityController from '#controllers/CityController'
import MetricsController from '#controllers/MetricsController'

router.on('/').render('pages/home')

router
  .group(() => {
    router
      .group(() => {
        router.get('/:id', [CityController, 'getCity'])
        router.post('/', [CityController, 'createCity'])
      })
      .prefix('/city')

    router.get('/cities', [CityController, 'getCities'])
    router.get('/_health', async ({ response }: HttpContext) => {
      return response.status(204)
    })
  })
  .prefix('/api/v1')
router.get('/metrics', [MetricsController, 'index'])
