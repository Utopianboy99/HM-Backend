const User = require('../models/User');
const Notification = require('../models/Notification');

function notify(userId, type, title, body, ref = null) {
  return new Notification({
    user_id: userId,
    type,
    title,
    body,
    ref_entity: ref?.entity || null,
    ref_entity_id: ref?.id || null,
  }).save();
}

module.exports = { notify };