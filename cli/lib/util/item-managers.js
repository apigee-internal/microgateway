'use strict'

const DEFAULT_EXIT_COUNT_INTERVAL = 1000  // 5000\
const MAX_PERIODS_EXIT_RATE = 5



module.exports.ExitCounter = class ExitCounter {

  // --
  constructor(theta,targetCB,interval) {
    this.periods = []
    this.exitsPerPeriod = 0
    this.threshold = theta
    this.checkRate = (interval !== undefined)? interval : DEFAULT_EXIT_COUNT_INTERVAL
    this.currentExitCount = 0

    this.checkInterval = setInterval(() => {
      var b = this.calcExitRate()
      if ( targetCB ) {
        targetCB(b)
      }
    },this.checkRate)
  }

  // --
  add(count) {
    this.periods.push(count)
  }

  //--
  averageRate() {
    var init = 0
    if ( this.periods.length > MAX_PERIODS_EXIT_RATE) {
      init = this.periods.shift()
    }
    var n = this.periods.length;
    if ( n === 0 ) {
      return 0
    }
    var sum = init
    for ( var i = 0; i < n; i++ ) {
      sum += this.periods[i]
    }
    var avg = sum/n

    return avg
  }

  // --
  calcExitRate() {
    var prevExitCount = this.currentExitCount;
    this.currentExitCount = 0;
    this.add(prevExitCount)
    if ( this.averageRate() > this.theta ) {
      console.log("EXPERIENCING HIGH RATE OF PROCESS EXITS")
      return(false)
    }
    return(true)
  }

  //
  incr() {
    this.currentExitCount++
  }

  // --
  stop() {
    clearInterval(this.checkInterval)
  }

}


/**
 * TimerList class
 * Maintain a list of timers identified by their timer object, returned but setTimout
 * Include convenience methods for adding, removing, and updating timers.
 */
module.exports.TimerList = class TimerList {
  //
  constructor() {
    this.items = []
  }
  //
  clear() {
    this.items.forEach((item) => {
      clearTimeout(item);
    })
    this.items = []
  }
  //
  add(id) {
    if ( this.items ) {
      this.items.push(id)
    }
  }
  //
  addTimeout(cb,tlapse) {
    var to = setTimeout(cb,tlapse)
    this.add(to)
    return(to)
  }

  replaceTimeout(id,cb,tlapse) {
    this.remove(id)
    this.addTimeout(cb,tlapse)
  }
  //
  remove(id) {
    if ( (id !== undefined) && (id !== null) ) {
      clearTimeout(id);
      if ( this.items ) {
        this.items.splice(this.items.indexOf(id),1)
      }
    }
    return undefined
  }
  //
}


//  CallbackList class
//  Add and remove callbacks. 
//  One method for calling all callbacks
//  This is useful in maintaining that should be called when a condition is met,
//  but all execution pathways to the condition cannot gaurantee a stack variable 
//  to be available for a single callback.
module.exports.CallbackList = class CallbackList {
  constructor() {
    this.items = []
  }
  //
  clear() {
    this.items = []
  }
  //
  add(cb) {
    if ( this.items && (typeof cb === 'function' ) ) {
      if ( this.items.indexOf(cb) < 0 ) {
        this.items.push(cb)
      }
    }
  }
  //
  remove(cb) {
    if ( typeof cb === 'function' ) {
      this.items.splice(this.items.indexOf(cb),1)
    }
  }

  runCallBacks() {
    if ( this.items && (this.items.length > 0) ) {
      this.items.forEach( cb => {
        try {
          cb()
        } catch (e) {
          console.log(e)
        }
      })  // when done eliminate
      this.items = []
    }
  }
}


