/* global describe, it, before */

import {AggregateRepository} from '../src/aggregate-repository'
import {Promise} from 'bluebird'
import helper from './helper'
import {expect} from 'chai'
import {DummyModel} from './dummy-model'
import {ModelEvent} from '../src/model-event'
import {EntryNotFoundError, EntryDeletedError} from '@rheactorjs/errors'

describe('AggregateRepository', function () {
  before(helper.clearDb)

  let repository

  before(() => {
    repository = new AggregateRepository(
      DummyModel,
      'dummy',
      helper.redis
    )
  })

  describe('.add()', () => {
    it('should add entities', () => {
      const john = new DummyModel('john.doe@example.invalid')
      const jane = new DummyModel('jane.doe@example.invalid')
      return Promise.join(repository.add(john, 'someAuthor'), repository.add(jane))
        .spread((event1, event2) => {
          expect(event1).to.be.instanceOf(ModelEvent)
          expect(event1.name).to.equal('DummyCreatedEvent')
          expect(event1.createdBy).to.equal('someAuthor')
          expect(event2).to.be.instanceOf(ModelEvent)
          expect(event2.createdBy).to.equal(undefined)
          return Promise
            .join(repository.getById(event1.aggregateId), repository.getById(event2.aggregateId))
            .spread((u1, u2) => {
              expect(u1.email).to.equal('john.doe@example.invalid')
              expect(u1.aggregateVersion()).to.equal(1)
              expect(u2.email).to.equal('jane.doe@example.invalid')
              expect(u2.aggregateVersion()).to.equal(1)
            })
        })
    })
  })

  describe('.remove()', () => {
    it('should remove entities', () => {
      const mike = new DummyModel('mike.doe@example.invalid')
      return repository.add(mike)
        .then((createdEvent) => {
          return repository.getById(createdEvent.aggregateId)
        })
        .then((persistedMike) => {
          expect(persistedMike.isDeleted()).to.equal(false)
          return repository
            .remove(persistedMike, 'someAuthor')
            .then((deletedEvent) => {
              expect(deletedEvent).to.be.instanceOf(ModelEvent)
              expect(deletedEvent.name).to.equal('DummyDeletedEvent')
              expect(deletedEvent.createdBy).to.equal('someAuthor')
              expect(persistedMike.isDeleted()).to.equal(true)
            })
        })
    })
  })

  describe('.findById()', () => {
    it(
      'should return undefined if entity not found',
      () => repository.findById('9999999')
        .then((user) => {
          expect(user).to.equal(undefined)
        })
    )
    it('should return undefined if entity is deleted', () => {
      const jim = new DummyModel('jim.doe@example.invalid')
      repository.add(jim)
        .then((createdEvent) => {
          return repository.getById(createdEvent.aggregateId)
        })
        .then((persistedJim) => {
          return repository
            .remove(persistedJim)
            .then(() => {
              repository.findById(persistedJim.aggregateId())
                .then((user) => {
                  expect(user).to.equal(undefined)
                })
            })
        })
    })
  })

  describe('.getById()', () => {
    it(
      'should throw an EntryNotFoundError if entity not found',
      () => Promise.try(repository.getById.bind(repository, '9999999'))
        .catch(err => EntryNotFoundError.is(err), (err) => {
          expect(err.message).to.be.contain('dummy with id "9999999" not found.')
        })
    )
    it('should throw an EntryDeletedError if entity is deleted', () => {
      const jack = new DummyModel('jack.doe@example.invalid')
      return repository.add(jack)
        .then((createdEvent) => {
          return repository.getById(createdEvent.aggregateId)
        })
        .then((persistedJack) => {
          return repository
            .remove(persistedJack)
            .then(() => {
              Promise
                .try(repository.getById.bind(repository, persistedJack.aggregateId()))
                .catch(err => EntryDeletedError.is(err), (err) => {
                  expect(err.message).to.be.contain('dummy with id "' + persistedJack.aggregateId() + '" is deleted.')
                  expect(err.entry).to.deep.equal(persistedJack)
                })
                .catch(err => {
                  console.log(err)
                })
            })
        })
    })
  })

  describe('.findAll()', () => {
    it(
      'should return all entities',
      () => repository.findAll()
        .then((entities) => {
          expect(entities.length).to.equal(2)
          expect(entities[0].email).to.equal('john.doe@example.invalid')
          expect(entities[1].email).to.equal('jane.doe@example.invalid')
        })
    )
  })

  describe('.is()', () => {
    it('should return true, if AggregateRepository is passed', () => {
      expect(AggregateRepository.is(new AggregateRepository({
        applyEvent: () => {
        }
      }, 'foo', {}))).to.equal(true)
    })
    it('should return true, if a similar object is passed', () => {
      const repo = {
        constructor: {name: AggregateRepository.name},
        aggregateRoot: '',
        aggregateAlias: '',
        aggregateAliasPrefix: '',
        eventStore: {},
        redis: {}
      }
      expect(AggregateRepository.is(repo)).to.equal(true)
    })
  })
})
