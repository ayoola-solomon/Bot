const moment = require('moment')
const axios = require('axios')
const _ = require('lodash')

module.exports = (controller) => {
  controller.on('facebook_postback', (bot, message) => {
    bot.reply(message, 'Great Choice!!!! (' + message.payload + ')')
  })

  controller.hears(['^hello', '^hi'], 'message_received', (bot, message) => {
    controller.storage.users.get(message.user, (err, user) => {
      if (err) {
        controller.debug(err)
      }
      if (user && user.name) {
        bot.reply(message, 'Hello ' + user.name + '!!')
      } else {
        bot.reply(message, 'Hello.')
      }
    })
  })

  controller.hears(['call me (.*)', 'my name is (.*)'], 'message_received', (bot, message) => {
    const name = message.match[1]
    controller.storage.users.get(message.user, (err, user) => {
      if (err) {
        console.error(err)
      }
      if (!user) {
        user = {
          id: message.user
        }
      }
      user.name = name
      controller.storage.users.save(user, (err, id) => {
        if (err) {
          console.error(err)
        }
        bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.')
      })
    })
  })

  controller.hears(['what is my name', 'who am i'], 'message_received', (bot, message) => {
    controller.storage.users.get(message.user, (err, user) => {
      if (err) {
        console.error(err)
      }
      if (user && user.name) {
        bot.reply(message, 'Your name is ' + user.name)
      } else {
        bot.startConversation(message, (err, convo) => {
          if (!err) {
            convo.say('I do not know your name yet!')
            convo.ask('What should I call you?', (response, convo) => {
              convo.ask('You want me to call you `' + response.text + '`?', [
                {
                  pattern: bot.utterances.yes,
                  callback: (response, convo) => { // since no further messages are
                    convo.next() // queued after this, the conversation will end naturally with status == 'completed'
                  }
                },
                {
                  pattern: bot.utterances.no,
                  callback: (response, convo) => {
                    convo.stop() // stop the conversation. this will cause it to end with status == 'stopped'
                  }
                },
                {
                  default: true,
                  callback: (response, convo) => {
                    convo.repeat()
                    convo.next()
                  }
                }
              ])

              convo.next()
            }, {'key': 'nickname'}) // store the results in a field called nickname

            convo.on('end', (convo) => {
              if (convo.status === 'completed') {
                bot.reply(message, 'OK! I will update my dossier...')

                controller.storage.users.get(message.user, (err, user) => {
                  if (err) {
                    console.error(err)
                  }
                  if (!user) {
                    user = {
                      id: message.user
                    }
                  }
                  user.name = convo.extractResponse('nickname')
                  controller.storage.users.save(user, (err, id) => {
                    if (err) {
                      console.error(err)
                    }
                    bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.')
                  })
                })
              } else {
                bot.reply(message, 'OK, nevermind!') // this happens if the conversation ended prematurely for some reason
              }
            })
          }
        })
      }
    })
  })

  controller.hears(['flight'], 'message_received', (bot, message) => {
    bot.startConversation(message, (err, convo) => {
      if (err) {
        console.error(err)
      }
      convo.say('Please provide answers the questions thats follows')
      convo.ask('Where are you flying from? e.g BERLIN', (response, convo) => {
        convo.ask('Where are you flying to? e.g LAGOS', (response, convo) => {
          convo.ask('When are you travelling? e,g 2017-02-15(YYYY-MM-DD)', (response, convo) => {
            convo.stop()
          }, {'key': 'date'})
          convo.next()
        }, {'key': 'destination'})
        convo.next()
      }, {'key': 'origin'})

      convo.on('end', (convo) => {
        if (convo.status === 'completed') {
          const origin = convo.extractResponse('origin')
          const destination = convo.extractResponse('destination')
          const date = convo.extractResponse('date')
          const formattedDate = formatDate(date)
          bot.reply(message, 'Please wait while we get flights from ' + origin + ' to ' + destination + ' on ' + formattedDate)
          fetchFlights(origin, destination, date, (response) => {
            bot.reply(message, response.totalDuration + ' ' + response.price)
            convo.next()
          })
        }
      })
    })
  })

  controller.on('message_received', (bot, message) => {
    bot.reply(message, 'Try: `what is my name` or `call me captain`')
    return false
  })
}

const fetchFlights = (origin, destination, date, cb) => {
  const request = {
    'request': {
      'slice': [
        {
          'origin': origin,
          'destination': destination,
          'date': date
        }
      ],
      'passengers': {
        'adultCount': 1,
        'infantInLapCount': 0,
        'infantInSeatCount': 0,
        'childCount': 0,
        'seniorCount': 0
      },
      'solutions': 5,
      'refundable': false
    }
  }
  const url = 'https://www.googleapis.com/qpxExpress/v1/trips/search'
  axios({
    method: 'post',
    url,
    data: request,
    params: {
      key: process.env.API_KEY
    }
  })
  .then((response) => {
    if (response.status === 200) {
      formatTrips(response.data.trips, (response) => {
        cb(response)
      })
    }
  })
  .catch((err) => {
    console.error(err)
  })
}

const formatTrips = (trips, cb) => {
  const response = {}
  _.map(trips.tripOption, (trip) => {
    response.price = trip.saleTotal
    response.segment = []
    _.map(trip.slice, (slice) => {
      response.totalDuration = convertMinutesToHours(slice.duration)
      _.map(slice.segment, (segment) => {
        const flight = {}
        flight.carrier = getNameFromTrip(trips.data['carrier'], segment.flight.carrier)
        const leg = segment.leg[0]
        flight.aircraft = leg.aircraft
        flight.arrivalTime = formatDate(leg.arrivalTime)
        flight.departureTime = formatDate(leg.departureTime)
        flight.origin = getNameFromTrip(trips.data['airport'], leg.origin)
        flight.destination = getNameFromTrip(trips.data['airport'], leg.destination)
        flight.duration = convertMinutesToHours(leg.duration)
        flight.meal = leg.meal
        flight.connectionDuration = convertMinutesToHours(segment.connectionDuration)
        response.segment.push(flight)
      })
      cb(response)
    })
  })
}

const formatDate = (dateTime) => {
  return moment(dateTime).format('dddd, MMMM Do YYYY')
}

const convertMinutesToHours = (duration) => {
  return moment.duration(duration, 'minutes').hours() + ' hours'
}

const getNameFromTrip = (data, code) => {
  return _.find(data, { code: code }).name
}
