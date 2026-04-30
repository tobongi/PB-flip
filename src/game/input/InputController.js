import Rx from 'rxjs/Rx';

export default class InputController {
  constructor(domElement) {
    const primaryMouseDown$ = Rx.Observable.fromEvent(domElement, 'mousedown').filter(event => event.button === 0);
    const primaryMouseUp$ = Rx.Observable.fromEvent(domElement, 'mouseup').filter(event => event.button === 0);

    this.down$ = Rx.Observable.merge(
      primaryMouseDown$,
      Rx.Observable.fromEvent(domElement, 'touchstart')
    ).do(event => {
      event.preventDefault();
    });

    this.up$ = Rx.Observable.merge(
      primaryMouseUp$,
      Rx.Observable.fromEvent(domElement, 'touchend')
    ).do(event => {
      event.preventDefault();
    });

    this.update$ = new Rx.Subject();
  }
}
