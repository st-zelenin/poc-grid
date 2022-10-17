var express = require('express');
var router = express.Router();
const { faker } = require('@faker-js/faker');

const data = Array(500).fill(undefined).map((_, i) => {
  const sex = Math.random() > 0.5 ? 'male' : 'female';

  return {
    id: i,
    firstName: faker.name.firstName(sex),
    lastName: faker.name.lastName(sex),
    sex,
    birthdate: faker.date.birthdate(),
    companyName: faker.company.name()
  }
})

router.get('/', function (req, res, next) {
  const { active, direction } = req.query;

  const take = Number(req.query.take);
  const skip = Number(req.query.skip);

  const sorted = active && direction
    ? sort(active, direction)
    : data;

  const body = sorted.slice(skip * take, skip * take + take);

  console.log({ take, skip, query: req.query, len: body.length, start: skip * take, end: skip * take + take });

  res.send(body);
});

const sort = (field, direction) => {
  if (field === 'id') {
    return [...data].sort((a, b) => direction === 'desc' ? b[field] - a[field] : a[field] - b[field])
  }

  const sorted = [...data].sort((a, b) => {
    if (a[field] === b[field]) {
      return 0
    }

    return a[field] > b[field] ? 1 : -1;
  });

  return direction === 'asc' ? sorted : sorted.reverse();
}

module.exports = router;
