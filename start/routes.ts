/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import CityController from "#controllers/CityController";

router.on('/').render('pages/home')

router.group(() => {

  router.post('/city', [CityController, 'createCity'])

  router.group(() => {
    router.get('/:id', [CityController, 'getCity'])

  }).prefix('/city')

}).prefix('/api/v1')
