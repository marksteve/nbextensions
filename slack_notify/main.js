define([
  'jquery',
  'moment',
  'notebook/js/codecell',
  'base/js/utils',
  'services/config'
], function ($, moment, codecell, utils, configmod) {
  'use strict'

  var log_prefix = '[slack_notify]'
  var params = {
    slack_notify_token: null,
    slack_notify_channel: '#general',
    slack_notify_threshold: 60,
    slack_notify_as_user: false
  }

  var base_url = utils.get_body_data('baseUrl')
  var config = new configmod.ConfigSection('notebook', {base_url: base_url})

  config.loaded.then(update_params)

  function update_params () {
    for (var key in params) {
      if (config.data.hasOwnProperty(key)) {
        params[key] = config.data[key]
      }
    }
  }

  var CodeCell = codecell.CodeCell
  var prev_get_callbacks = CodeCell.prototype.get_callbacks
  CodeCell.prototype.get_callbacks = function () {
    var cell = this
    var callbacks = prev_get_callbacks.apply(cell, arguments)

    var prev_reply_callback = callbacks.shell.reply
    callbacks.shell.reply = function (msg) {
      if (msg.msg_type === 'execute_reply') {
        slack_notify(cell)
      }
      return prev_reply_callback(msg)
    }

    return callbacks
  }

  function slack_notify (cell) {
    var token = params.slack_notify_token
    var channel = params.slack_notify_channel
    var threshold = parseInt(params.slack_notify_threshold, 10)
    var as_user = params.slack_notify_as_user

    var cell_id = cell.cell_id
    var notebook_name = cell.notebook.notebook_name

    var text = 'Cell *' + cell_id + '* from notebook *' + notebook_name + '* finished running'

    var exec_time = cell.metadata.ExecuteTime
    var exec_duration_unit = 'seconds'
    var exec_duration = moment(exec_time.end_time).diff(exec_time.start_time) / 1000

    if (exec_duration < threshold) {
      console.log(log_prefix, 'execution duration', exec_duration, "didn't meet threshold:", threshold)
      return
    } else {
      console.log(log_prefix, 'posting slack notification...')
    }

    if (exec_duration > 60) {
      exec_duration_unit = 'minutes'
      exec_duration /= 60
    }
    if (exec_duration > 60) {
      exec_duration_unit = 'hours'
      exec_duration /= 60
    }
    if (exec_duration > 24) {
      exec_duration_unit = 'days'
      exec_duration /= 24
    }
    text += ' in _' + exec_duration + ' ' + exec_duration_unit + '_'

    var outputs = cell.output_area.outputs.reduce(function (outputs, output) {
      return outputs + output.text
    }, '')

    text += ': ```' + outputs + '```'

    $.ajax({
      url: 'https://slack.com/api/chat.postMessage',
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: {
        token: token,
        channel: channel,
        as_user: as_user,
        text: text
      }
    })
  }

  function load_ipython_extension () {
    config.load()
  }

  return {
    load_ipython_extension: load_ipython_extension
  }
})
