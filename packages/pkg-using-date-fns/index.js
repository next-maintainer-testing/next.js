const { format } = require('date-fns')

exports.formattedDate = format(new Date(2025, 0, 2), 'yyyy-MM-dd')
