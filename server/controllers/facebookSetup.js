module.exports = function (controller) {
  controller.api.thread_settings.greeting('Hello! I\'m a Botkit bot!')
  controller.api.thread_settings.get_started('sample_get_started_payload')
  controller.api.thread_settings.menu([
    {
      'type': 'postback',
      'title': 'Hello',
      'payload': 'hello'
    },
    {
      'type': 'postback',
      'title': 'Help',
      'payload': 'help'
    }
  ])
}
