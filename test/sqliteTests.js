/* @flow */

import db from 'sqlite'
import tapeSnapInit from './tapeSnap'
import * as _ from 'lodash'
import * as baseDialect from '../src/dialects/base'
import dialect from '../src/dialects/sqlite'
import * as sqliteDriver from '../src/drivers/sqlite'
import * as csvimport from '../src/csvimport'
import * as util from './reltabTestUtils'
import * as aggtree from '../src/aggtree'
import PathTree from '../src/PathTree'
var sharedRtc
const testPath = 'csv/barttest.csv'

let q1, pcols, q2, q3, q4, q5, q5b, q6, q7, q8, q9, q10, q11, barttestTi

var tcoeSum

const afterInit = (htest) => {
  q1 = dialect.tableQuery(barttestTi)

  pcols = ['JobFamily', 'Title', 'Union', 'Name', 'Base', 'TCOE']
  q2 = q1.project(pcols)

  q3 = q1.groupBy(['JobFamily', 'Title'], [new dialect.Field({ name: 'TCOE', type: 'integer' })])  // note: [ 'TCOE' ] equivalent to [ [ 'sum', 'TCOE' ] ]

  q4 = q2.groupBy([new dialect.Field({ name: 'JobFamily' })], [new dialect.Field({ name: 'Title' }), new dialect.Field({ name: 'Union' }), new dialect.Field({ name: 'Name' }), new dialect.Field({ name: 'Base' }), new dialect.Field({ name: 'TCOE', type: 'integer' })])

  q5 = q1.filter(dialect.Condition.and().eq('JobFamily', 'Executive Management'))

// Test for literal string with single quote (which must be escaped):
  q5b = q1.filter(new dialect.Condition('$and', [new dialect.Filter({ op: '$eq', lhs: 'Title', rhs: 'Department Manager Gov\'t & Comm Rel' })]))

  q6 = q1.mapColumns({Name: {name: 'Name', displayName: 'Employee Name', type: 'text'}})

  q7 = q1.mapColumnsByIndex({'0': {name: 'Name'}})

  q8 = q5.concat(q1.filter(dialect.Condition.and().eq('JobFamily', 'Safety')))

  q9 = q8.sortBy([['Name', true]])

  q10 = q8.sortBy([['JobFamily', true], ['TCOE', false]])

  q11 = q8.extend('ExtraComp', {type: 'integer'}, 'TCOE - Base')
}

const dbTest0 = (htest) => {
  htest('basic table query', t => {
    const rtc = sharedRtc // Note: need to ensure we only read sharedRtc inside test()
    console.log('dbTest0: test start: ', rtc)
    rtc.evalQuery(q1)
      .then(res => {
        t.ok(true, 'basic table read')
        var schema = res.schema
        var expectedCols = [ 'Name', 'Title', 'Base', 'TCOE', 'JobFamily', 'Union' ]

        const columns = schema.columns // array of strings

        t.deepEqual(columns, expectedCols, 'getSchema column ids')

        const columnTypes = columns.map(colId => schema.columnType(colId))
        var expectedColTypes = [ 'text', 'text', 'integer', 'integer', 'text', 'text' ]
        t.deepEqual(columnTypes, expectedColTypes, 'getSchema column types')

        const rowData = res.rowData
        t.equal(rowData.length, 23, 'q1 rowData.length')

        // console.log(rowData[0])
        var expRow0 = {
          'Name': 'Crunican, Grace',
          'Title': 'General Manager',
          'Base': 312461,
          'TCOE': 399921,
          'JobFamily': 'Executive Management',
          'Union': 'Non-Represented'
        }
        t.deepEqual(rowData[0], expRow0, 'first row matches expected')

        tcoeSum = util.columnSum(res, 'TCOE')
        console.log('TCOE sum: ', tcoeSum)

        t.end()
      })
  })
}

const dbTestRowCount0 = (htest) => {
  htest('basic row count', t => {
    const rtc = sharedRtc // Note: need to ensure we only read sharedRtc inside test()
    console.log('dbTestRowCount0: test start: ', rtc)
    rtc.rowCount(q1)
      .then(rowCount => {
        t.ok(true, 'got row count!')
        console.log('rowCount: ', rowCount)
        t.equal(rowCount, 23, 'row count matches expected')
        t.end()
      })
  })
}

const dbTest2 = (htest) => {
  htest('basic project operator', t => {
    const rtc = sharedRtc
    t.plan(3)
    // console.log('q2: ', q2)
    rtc.evalQuery(q2).then(res => {
      t.ok(true, 'project query returned success')
      // console.log('project query schema: ', res.schema)
      t.deepEqual(res.schema.columns, pcols, 'result schema from project')

      // Note: object is actually identical under projection using
      // object rep of row data
      var expRow0 = {
        'Name': 'Crunican, Grace',
        'Title': 'General Manager',
        'Base': 312461,
        'TCOE': 399921,
        'JobFamily': 'Executive Management',
        'Union': 'Non-Represented'
      }
      console.log(res.rowData)
      t.deepEqual(res.rowData[0], expRow0, 'project result row 0')
      t.end()
    })
  })
}

const dbTest3 = (htest) => {
  htest('basic groupBy', t => {
    const rtc = sharedRtc
    rtc.evalQuery(q3).then(res => {
      // console.log('groupBy result: ', res)

      const expCols = ['JobFamily', 'Title', 'TCOE']
      t.deepEqual(res.schema.columns, expCols, 'groupBy query schema')

      t.deepEqual(res.rowData.length, 19, 'correct number of grouped rows')

      const groupSum = util.columnSum(res, 'TCOE')
      t.equal(groupSum, tcoeSum, 'grouped TCOE sum matches raw sum')
      t.end()
    })
  })
}

const dbTest4 = (htest) => {
  htest('groupBy aggs', t => {
    const rtc = sharedRtc
    rtc.evalQuery(q4).then(res => {
      console.log('group by job family: ')
      util.logTable(res)

      var rs = res.schema

      const expCols = ['JobFamily', 'Title', 'Union', 'Name', 'Base', 'TCOE']
      t.deepEqual(rs.columns, expCols)

      t.deepEqual(res.rowData.length, 9, 'number of grouped rows in q4 result')

      const groupSum = util.columnSum(res, 'TCOE')
      t.deepEqual(groupSum, tcoeSum, 'tcoe sum after groupBy')
      t.end()
    }, util.mkAsyncErrHandler(t, 'evalQuery q4'))
  })
}

const sqliteQueryTest = (htest, label: string, query: () => dialect.QueryExp,
                         cf: (t: any, res: baseDialect.TableRep) => void): void => {
  htest(label, t => {
    const rtc = sharedRtc
    rtc.evalQuery(query()).then(res => cf(t, res), util.mkAsyncErrHandler(t, label))
  })
}

const dbTest5 = (htest) => {
  sqliteQueryTest(htest, 'basic filter', () => q5, (t, res) => {
    t.equal(res.rowData.length, 4, 'expected row count after filter')
    util.logTable(res)
    t.end()
  })
}

const dbTest5b = (htest) => {
  sqliteQueryTest(htest, 'escaped literal string filter', () => q5b, (t, res) => {
    t.equal(res.rowData.length, 1, 'expected row count after filter')
    util.logTable(res)
    t.end()
  })
}

const serTest0 = (htest) => {
  let dq5
  htest('query deserialization', t => {
    let req : Object = { query: q5 }
    const ser5 = JSON.stringify(req, null, 2)
    console.log('serialized query')
    console.log(ser5)
    dq5 = dialect.deserializeQueryReq(ser5)
    console.log('deserialized query: ', dq5)
    const rtc = sharedRtc
    rtc.evalQuery(dq5.query)
      .then(res => {
        console.log('got results of evaluating deserialized query')
        util.logTable(res)
        t.equal(res.rowData.length, 4, 'expected row count after filter')
        t.end()
      }, util.mkAsyncErrHandler(t, 'query deserialization'))
  })
}

const dbTest6 = (htest) => {
  sqliteQueryTest(htest, 'mapColumns', () => q6, (t, res) => {
    const rs = res.schema
    console.log(rs.columns)
    t.ok(rs.columns[0], 'Name', 'first column key is employee name')
    const em = rs.fieldMap['Name']
    t.deepEqual(em.toJS(), {type: 'text', name: 'Name', alias: 'Name', displayName: 'Employee Name', expType: 'Field'}, 'EmpName metadata')
    t.equal(res.rowData.length, 23, 'expected row count after mapColumns')
    t.end()
  })
}

const dbTest7 = (htest) => {
  sqliteQueryTest(htest, 'mapColumnsByIndex', () => q7, (t, res) => {
    const rs = res.schema
    t.ok(rs.columns[0], 'Name', 'first column key is employee name')
    t.equal(res.rowData.length, 23, 'expected row count after mapColumnsByIndex')
    t.end()
  })
}

const dbTest8 = (htest) => {
  sqliteQueryTest(htest, 'concat', () => q8, (t, res) => {
    t.equal(res.rowData.length, 5, 'expected row count after filter and concat')
    const jobCol = res.getColumn('JobFamily')
    const jobs = _.sortedUniq(jobCol)
    t.deepEqual(jobs, ['Executive Management', 'Safety'], 'filter and concat column vals')
    t.end()
  })
}

const dbTest9 = (htest) => {
  sqliteQueryTest(htest, 'basic sort', () => q9, (t, res) => {
    util.logTable(res)
    t.end()
  })
}

const dbTest10 = (htest) => {
  sqliteQueryTest(htest, 'compound key sort', () => q10, (t, res) => {
    util.logTable(res)
    t.end()
  })
}

const dbTest11 = (htest) => {
  sqliteQueryTest(htest, 'extend with expression', () => q11, (t, res) => {
    util.logTable(res)
    t.end()
  })
}

const aggTreeTest0 = (htest) => {
  htest('initial aggTree test', t => {
    const q0 = dialect.tableQuery(barttestTi).project(pcols)
    const rtc = sharedRtc
    const schema = aggtree.getBaseSchema(dialect, rtc, q0)
    console.log('got schema: ', schema)
    const tree0 = aggtree.vpivot(rtc, q0, schema, dialect, [new dialect.Field({name: 'JobFamily'}), new dialect.Field({name: 'Title'})], 'Name', true, [])

    const rq0 = tree0.rootQuery
    console.log('root query exp: ', rq0)
    rtc.evalQuery(rq0)
      .then(res => {
        console.log('root query: ')
        util.logTable(res)

        const q1 = tree0.applyPath([])
        return rtc.evalQuery(q1)
      })
      .then(res => {
        console.log('open root query: ')
        util.logTable(res)
        const expCols = ['JobFamily', 'Title', 'Union', 'Name', 'Base', 'TCOE', 'Rec', '_depth', '_pivot', '_isRoot', '_sortVal_0', '_sortVal_1', '_sortVal_2', '_path0', '_path1']

        t.deepEqual(res.schema.columns, expCols, 'Q1 schema columns')
        t.deepEqual(res.rowData.length, 9, 'Q1 rowData length')

        const actSum = util.columnSum(res, 'TCOE')

        t.deepEqual(actSum, 4691559, 'Q1 rowData sum(TCOE)')

        const q2 = tree0.applyPath(['Executive Management'])
        return rtc.evalQuery(q2)
      })
      .then(res => {
        console.log('after opening path "Executive Management":')
        util.logTable(res)

        const q3 = tree0.applyPath(['Executive Management', 'General Manager'])
        return rtc.evalQuery(q3)
      })
      .then(res => {
        console.log('after opening path /Executive Management/General Manager:')
        util.logTable(res)

        // const openPaths = {'Executive Management': {'General Manager': {}}, 'Safety': {}}
        const openPaths = new PathTree({'"Executive Management"': {}})
        const q4 = tree0.getTreeQuery(openPaths)
        return rtc.evalQuery(q4)
      })
      .then(res => {
        console.log('evaluating query returned from getTreeQuery:')
        util.logTable(res)
      })
      .then(() => t.end())
      .catch(util.mkAsyncErrHandler(t, 'aggtree queries chain'))
  })
}

const aggTreeTest1 = (htest) => {
  htest('sorted aggTree test', t => {
    const q0 = dialect.tableQuery(barttestTi).project(pcols)
    const rtc = sharedRtc
    const schema = aggtree.getBaseSchema(dialect, rtc, q0)
    const tree0 = aggtree.vpivot(rtc, q0, schema, dialect,
        [new dialect.Field({ name: 'JobFamily' }), new dialect.Field({ name: 'Title' })], 'Name', true,
      [['TCOE', false], ['Base', true], ['Title', true]])

    const sq1 = tree0.getSortQuery(1)

    rtc.evalQuery(sq1)
      .then(res => {
        console.log('sort query depth 1: ')
        util.logTable(res)
      })
      .then(() => {
        const sq2 = tree0.getSortQuery(2)

        return rtc.evalQuery(sq2)
      })
      .then(res2 => {
        console.log('sort query depth 2: ')
        util.logTable(res2)
      })
      .then(() => {
        const q1 = tree0.applyPath([])
        const sq1 = tree0.getSortQuery(1)

        console.log('got depth 1 query and sortQuery, joining...: ')
        const jq1 = q1.join(sq1, '_path0')

        return rtc.evalQuery(jq1)
      })
      .then(res => {
        console.log('result of join query: ')
        util.logTable(res)
      })
      .then(() => t.end())
      .catch(util.mkAsyncErrHandler(t, 'aggtree queries chain'))
  })
}

// Let's try async / await:
const asyncTest1 = (htest) => {
  const tf = async (t) => {
    const q0 = dialect.tableQuery(barttestTi).project(pcols)
    const rtc = sharedRtc
    const res0 = await rtc.evalQuery(q0)
    console.log('tf: got result:')
    console.log(res0.rowData[0], '\n...')
    console.log('done logging table')
    t.ok(true, 'handle async result')
    t.end()
  }

  htest('basic async test', t =>
    tf(t).catch(util.mkAsyncErrHandler(t, 'basic async test')))
}

const asyncAggTreeSortTest = (htest) => {
  const tf = async (t) => {
    const q0 = dialect.tableQuery(barttestTi).project(pcols)
    const rtc = sharedRtc
    const schema0 = aggtree.getBaseSchema(dialect, rtc, q0)
    const tree0 = await aggtree.vpivot(rtc, q0, schema0, dialect,
      [new dialect.Field({ name: 'JobFamily' }), new dialect.Field({ name: 'Title' })], 'Name', true,
      [[new dialect.Field({ name: 'TCOE' }), false], [new dialect.Field({ name: 'Base' }), true], [new dialect.Field({ name: 'Title' }), true]])
    console.log('vpivot initial promise resolved...')

    const sq1 = tree0.getSortQuery(1)

    const res1 = await rtc.evalQuery(sq1)
    console.log('sort query depth 1: ')
    util.logTable(res1)

    const sq2 = tree0.getSortQuery(2)

    const res2 = await rtc.evalQuery(sq2)

    console.log('sort query depth 2: ')
    util.logTable(res2, {maxRows: 25})

    // take sq1 and join with query of depth 1:
    const q1 = tree0.applyPath([])
    const jq1 = q1.join(sq1, ['_path0'])

    const jres1 = await rtc.evalQuery(jq1)

    console.log('join result for depth 1: ')
    util.logTable(jres1, {maxRows: 25})

    const q2 = tree0.applyPath([ 'Executive Management' ])
    const jq2 = q2.join(sq1, ['_path0']).join(sq2, ['_path0', '_path1'])

    const jres2 = await rtc.evalQuery(jq2)

    console.log('level 2 join result:')
    util.logTable(jres2, {maxRows: 25})

    const openPaths = new PathTree({'"Executive Management"': {'"General Manager"': {}}, '"Safety"': {}})
    // const openPaths = {'Executive Management': {}}
    const q4 = tree0.getTreeQuery(openPaths)
    const res4 = await rtc.evalQuery(q4)

    console.log('tree query after opening paths:')
    util.logTable(res4, {maxRows: 50})

    const jq4 = q4.join(sq1, ['_path0']).join(sq2, ['_path0', '_path1'])
    const jres4 = await rtc.evalQuery(jq4)

    console.log('tree query after sort joins:')
    util.logTable(jres4, {maxRows: 50})

    const stq = tree0.getSortedTreeQuery(openPaths)
    const sres = await rtc.evalQuery(stq)

    console.log('result of sorted tree query:')
    util.logTable(sres, {maxRows: 50})

    t.ok(true, 'finished getting sort tables')
    t.end()
  }

  htest('asyncAggTreeSortTest', t =>
    tf(t).catch(util.mkAsyncErrHandler(t, 'async aggree sort test')))
}

const asyncTest = (htest, testName, tf) => {
  return htest(testName, t =>
    tf(t, htest).catch(util.mkAsyncErrHandler(t, testName)))
}

/*
 * A bad case we encountered interactively: Pivot by JobFamily, sort by Title
 */
const basicPivotSortTest = async (t, htest) => {
  const deepEqualSnap = tapeSnapInit(htest)
  const q0 = dialect.tableQuery(barttestTi).project(pcols)
  const rtc = sharedRtc
  const schema0 = aggtree.getBaseSchema(dialect, rtc, q0)
  const tree0 = await aggtree.vpivot(rtc, q0, schema0, dialect,
    [new dialect.Field({ name: 'JobFamily' })], 'Name', true,
    [[new dialect.Field({ name: 'Title' }), true]])
  console.log('vpivot initial promise resolved...')

  const openPaths = new PathTree({'"Legal & Paralegal"': {}})

  const stq = tree0.getSortedTreeQuery(openPaths)
  const sres = await rtc.evalQuery(stq)

  console.log('result of sorted tree query:')
  util.logTable(sres, {maxRows: 50})

  deepEqualSnap(t, sres, 'sorted tree query matches snapshot')

  t.end()
}

/*
 * Same as basicPivotSortTest, but title in descending order.
 *
 * Has shown issues with wrong sort order in the wild:
 */
const descPivotSortTest = async (t, htest) => {
  const deepEqualSnap = tapeSnapInit(htest)
  const q0 = dialect.tableQuery(barttestTi).project(pcols)
  const rtc = sharedRtc
  const schema0 = aggtree.getBaseSchema(dialect, rtc, q0)
  const tree0 = await aggtree.vpivot(rtc, q0, schema0, dialect,
    [new dialect.Field({ name: 'JobFamily' })], 'Name', true,
    [[new dialect.Field({ name: 'Title' }), false]])
  console.log('vpivot initial promise resolved...')

  const pq = tree0.applyPath([])

  const baseRes = await rtc.evalQuery(pq)

  console.log('baseRes:')
  util.logTable(baseRes)

  const openPaths = new PathTree({'"Legal & Paralegal"': {}})

  const stq = tree0.getSortedTreeQuery(openPaths)
  const sres = await rtc.evalQuery(stq)

  console.log('result of sorted tree query:')
  util.logTable(sres, {maxRows: 50})

  deepEqualSnap(t, sres, 'sorted tree query matches snapshot')

  t.end()
}

/*
 * Multiple levels of pivot, single sort column:
 */
const multiPivotSingleSortTest = async (t, htest) => {
  const deepEqualSnap = tapeSnapInit(htest)
  const q0 = dialect.tableQuery(barttestTi).project(pcols)
  const rtc = sharedRtc
  const schema0 = aggtree.getBaseSchema(dialect, rtc, q0)
  const tree0 = await aggtree.vpivot(rtc, q0, schema0, dialect,
    [new dialect.Field({ name: 'JobFamily' }), new dialect.Field({ name: 'Title' })], 'Name', true,
    [[new dialect.Field({ name: 'Title' }), true]])
  console.log('vpivot initial promise resolved...')

  const openPaths = new PathTree({'"Legal & Paralegal"': {}})

  const stq = tree0.getSortedTreeQuery(openPaths)
  const sres = await rtc.evalQuery(stq)

  console.log('result of sorted tree query:')
  util.logTable(sres, {maxRows: 50})

  deepEqualSnap(t, sres, 'sorted tree query')

  t.end()
}

/*
 * Pivot by an integer column and open a few nodes:
 */
const intPivotTest = async (t, htest) => {
  const deepEqualSnap = tapeSnapInit(htest)
  const q0 = dialect.tableQuery(barttestTi).project(pcols)
  const rtc = sharedRtc
  const schema0 = aggtree.getBaseSchema(dialect, rtc, q0)
  const tree0 = await aggtree.vpivot(rtc, q0, schema0, dialect,
    [new dialect.Field({ name: 'Base' }), new dialect.Field({ name: 'JobFamily' })], 'Name', true, [])
  console.log('vpivot initial promise resolved...')

  const openPaths = new PathTree({
    '75701': {'"Police"': {}},
    '77446': {'"Maintenance, Vehicle & Facilities"': {}}
  })

  const stq = tree0.getSortedTreeQuery(openPaths)
  const sres = await rtc.evalQuery(stq)

  console.log('result of numeric pivot:')
  util.logTable(sres, {maxRows: 50})

  deepEqualSnap(t, sres, 'int pivot query')

  t.end()
}

// queryGenPerfTest
const queryGenPerfTest = async (t) => {
  const q0 = dialect.tableQuery(barttestTi).project(pcols)
  const rtc = sharedRtc
  const schema0 = aggtree.getBaseSchema(dialect, rtc, q0)
  const tree0 = await aggtree.vpivot(rtc, q0, schema0, dialect,
    [new dialect.Field({ name: 'JobFamily' }), new dialect.Field({ name: 'Title' })], 'Name', true,
    [['Title', true]])
  console.log('vpivot initial promise resolved...')

  const openPaths = new PathTree({'"Executive Management"': {'"General Manager"': {}}, '"Safety"': {}})

  const stq = tree0.getSortedTreeQuery(openPaths)

  let count = 50
  while (count > 0) {
    const sres = await rtc.evalQuery(stq) // eslint-disable-line
    count--
  }
  t.pass('executed all queries')
  t.end()
}

const distinctTest = async (t, htest) => {
  const deepEqualSnap = tapeSnapInit(htest)
  const tq = reltab.tableQuery('barttest').distinct('JobFamily')
  const rtc = sharedRtc

  const dres = await rtc.evalQuery(tq)
  deepEqualSnap(t, dres, 'distinct query')

  t.pass('distinct query')
  t.end()
}

const doit = true

const sqliteTestSetup = (htest) => {
  htest('sqlite test setup', async (t) => {
    try {
      const showQueries = global.showQueries
      const rtc = await sqliteDriver.getContext(':memory:', {showQueries})
      const md = await csvimport.importSqlite(testPath, ',', {noHeaderRow: false})
      const ti = csvimport.mkTableInfo(md)
      barttestTi = ti

      rtc.registerTable(ti)
      sharedRtc = rtc
      console.log('set rtc: ', sharedRtc)

      afterInit()
      t.ok(true, 'setup and import complete')
      t.end()
    } catch (err) {
      console.error('sqliteTestSetup failure: ', err, err.stack)
    }
  })
}

const sqliteTestShutdown = (htest) => {
  htest('sqlite test shutdown', t => {
    db.close()
      .then(() => {
        console.log('shut down sqlite')
        t.ok(true, 'finished db.close')
        t.end()
        // And exit on next tick:
        setImmediate(() => { process.exit(0) })
      })
  })
}

const runTests = (htest: any) => {
  sqliteTestSetup(htest)

  if (doit) {
    dbTest0(htest)
    dbTestRowCount0(htest)
    dbTest2(htest)
    dbTest3(htest)
    dbTest4(htest)
    dbTest5(htest)
    dbTest5b(htest)
    serTest0(htest)
    dbTest6(htest)
    dbTest7(htest)
    dbTest8(htest)
    dbTest9(htest)

    dbTest10(htest)
    dbTest11(htest)

    aggTreeTest0(htest)

    aggTreeTest1(htest)
    asyncTest1(htest)

    asyncAggTreeSortTest(htest)

    asyncTest(htest, 'basicPivotSortTest', basicPivotSortTest)

    asyncTest(htest, 'descPivotSortTest', descPivotSortTest)
    asyncTest(htest, 'multiPivotSingleSortTest', multiPivotSingleSortTest)
    asyncTest(htest, 'intPivotTest', intPivotTest)

    asyncTest(htest, 'queryGenPerfTest', queryGenPerfTest)

    asyncTest(htest, 'distinctTest', distinctTest)
  }

  sqliteTestShutdown(htest)
}

module.exports = runTests
