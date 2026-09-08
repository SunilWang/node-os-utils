/**
 * CacheManager单元测试
 * 测试缓存管理器的核心功能，不依赖平台
 */

import { expect } from 'chai'
import { CacheManager } from '../../../src/core/cache-manager'

describe('CacheManager Unit Tests', function() {
  let cacheManager: CacheManager

  beforeEach(function() {
    cacheManager = new CacheManager({
      defaultTTL: 1000,
      maxSize: 10,
      enabled: true
    })
  })

  afterEach(function() {
    cacheManager.clear()
  })

  describe('基本缓存功能', function() {
    it('应该能够设置和获取缓存值', function() {
      const key = 'test-key'
      const value = { test: 'data' }

      cacheManager.set(key, value)
      const retrieved = cacheManager.get(key)

      expect(retrieved).to.deep.equal(value)
    })

    it('应该在TTL过期后返回undefined', function(done) {
      const key = 'ttl-test'
      const value = 'test-value'
      const shortTTL = 50

      cacheManager.set(key, value, shortTTL)

      // 立即检查，应该存在
      expect(cacheManager.get(key)).to.equal(value)

      // TTL过期后检查
      setTimeout(() => {
        expect(cacheManager.get(key)).to.be.undefined
        done()
      }, shortTTL + 10)
    })

    it('应该正确报告缓存命中状态', function() {
      const key = 'hit-test'
      const value = 'hit-value'

      expect(cacheManager.has(key)).to.be.false

      cacheManager.set(key, value)
      expect(cacheManager.has(key)).to.be.true
    })
  })

  describe('缓存大小限制', function() {
    it('应该在达到最大大小时移除最老的条目', function() {
      const maxSize = 3
      const smallCache = new CacheManager({
        defaultTTL: 10000,
        maxSize: maxSize,
        enabled: true
      })

      // 填充缓存到最大值
      for (let i = 0; i < maxSize; i++) {
        smallCache.set(`key-${i}`, `value-${i}`)
      }

      // 验证所有项都在缓存中
      for (let i = 0; i < maxSize; i++) {
        expect(smallCache.has(`key-${i}`)).to.be.true
      }

      // 添加一个新项，应该移除最老的
      smallCache.set('new-key', 'new-value')

      // 最老的应该被移除
      expect(smallCache.has('key-0')).to.be.false
      // 新的应该存在
      expect(smallCache.has('new-key')).to.be.true
      // 其他的应该还在
      expect(smallCache.has('key-1')).to.be.true
      expect(smallCache.has('key-2')).to.be.true
    })
  })

  describe('缓存配置', function() {
    it('禁用缓存时应该始终返回undefined', function() {
      const disabledCache = new CacheManager({
        defaultTTL: 1000,
        maxSize: 10,
        enabled: false
      })

      disabledCache.set('test', 'value')
      expect(disabledCache.get('test')).to.be.undefined
      expect(disabledCache.has('test')).to.be.false
    })

    it('应该能够清空所有缓存', function() {
      cacheManager.set('key1', 'value1')
      cacheManager.set('key2', 'value2')

      expect(cacheManager.has('key1')).to.be.true
      expect(cacheManager.has('key2')).to.be.true

      cacheManager.clear()

      expect(cacheManager.has('key1')).to.be.false
      expect(cacheManager.has('key2')).to.be.false
    })
  })

  describe('边界情况', function() {
    it('应该处理undefined和null值', function() {
      cacheManager.set('undefined-key', undefined)
      cacheManager.set('null-key', null)

      expect(cacheManager.get('undefined-key')).to.be.undefined
      expect(cacheManager.get('null-key')).to.be.null
      expect(cacheManager.has('null-key')).to.be.true
    })

    it('应该处理复杂对象', function() {
      const complexObject = {
        nested: {
          array: [1, 2, 3],
          func: () => 'test'
        },
        date: new Date(),
        regex: /test/gi
      }

      cacheManager.set('complex', complexObject)
      const retrieved = cacheManager.get('complex')

      expect(retrieved).to.deep.equal(complexObject)
    })

    it('应该处理空字符串键', function() {
      const value = 'empty-key-value'
      cacheManager.set('', value)

      expect(cacheManager.get('')).to.equal(value)
      expect(cacheManager.has('')).to.be.true
    })
  })
})
