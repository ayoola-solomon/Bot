const dotenv = require('dotenv')
const Botkit = require('botkit')
const localtunnel = require('localtunnel')
const commandLineArgs = require('command-line-args')

const facebookSetup = require('./server/controllers/facebookSetup')
const conversations = require('./server/controllers/conversations')

dotenv.load()
const ops = commandLineArgs([
  {name: 'lt',
    alias: 'l',
    args: 1,
    description: 'Use localtunnel.me to make your bot available on the web.',
    type: Boolean,
    defaultValue: false},
  {name: 'ltsubdomain',
    alias: 's',
    args: 1,
    description: 'Custom subdomain for the localtunnel.me URL. This option can only be used together with --lt.',
    type: String,
    defaultValue: null}
])

if (ops.lt === false && ops.ltsubdomain !== null) {
  console.log('error: --ltsubdomain can only be used together with --lt.')
  process.exit()
}

const controller = Botkit.facebookbot({
  debug: false,
  log: true,
  access_token: process.env.FACEBOOK_PAGE_TOKEN,
  verify_token: process.env.FACEBOOK_VERIFY_TOKEN,
  app_secret: process.env.FACEBOOK_APP_SECRET,
  validate_requests: true
})

const bot = controller.spawn({})

controller.setupWebserver(process.env.port || 3000, (err, webserver) => {
  if (err) {
    console.error(err)
  }
  controller.createWebhookEndpoints(webserver, bot, () => {
    console.log('BOT IS NOW ONLINE!')
    if (ops.lt) {
      const tunnel = localtunnel(process.env.port || 3000, {subdomain: ops.ltsubdomain}, (err, tunnel) => {
        if (err) {
          console.log(err)
          process.exit()
        }
        console.log('Bot is available on the web at the following URL: ' + tunnel.url + '/facebook/receive')
      })

      tunnel.on('close', function () {
        console.log('Bot is no longer available on the web at the localtunnnel.me URL.')
        process.exit()
      })
    }
  })
})

facebookSetup(controller)
conversations(controller)
