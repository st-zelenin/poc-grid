import { HttpClient } from '@angular/common/http';
import {
  AfterViewInit,
  Component,
  Injectable,
  NgZone,
  OnInit,
  ViewChild,
} from '@angular/core';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  CdkScrollable,
  CdkVirtualScrollable,
  CdkVirtualScrollRepeater,
  CdkVirtualScrollViewport,
  ScrollDispatcher,
} from '@angular/cdk/scrolling';
import {
  BehaviorSubject,
  combineLatest,
  delay,
  exhaustMap,
  filter,
  from,
  map,
  Observable,
  of,
  startWith,
  Subscription,
  switchMap,
  tap,
} from 'rxjs';
import {
  FixedSizeVirtualScrollStrategy,
  VIRTUAL_SCROLL_STRATEGY,
} from '@angular/cdk/scrolling';
import { DataSource } from '@angular/cdk/table';
import { ListRange } from '@angular/cdk/collections';

export class CustomVirtualScrollStrategy extends FixedSizeVirtualScrollStrategy {
  constructor() {
    super(50, 250, 500);
  }
}
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit, AfterViewInit {
  constructor(
    private readonly http: HttpClient,
    private readonly ngZone: NgZone
  ) {
    this.dataSource = new InfiniteVirtualDataSource(this.ngZone);
  }
  ngAfterViewInit(): void {}

  public title = 'grid-ui';
  public displayedColumns: string[] = ['checkbox', 'id', 'firstName', 'lastName', 'sex', 'birthdate', 'companyName'];
  public dataSource: InfiniteVirtualDataSource<{ id: number; title: string }>;
  public rows: Observable<any[]> = of([]);

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild('viewPort', { static: true }) viewPort!: CdkVirtualScrollViewport;

  ngOnInit(): void {
    this.dataSource.attach(this.viewPort, this.fetcher);
  }

  private groupCounter = 0;

  private fetcher: Fetcher<any> = (page: number, size: number) => {
    const api = 'https://playground-sz.azurewebsites.net/api/table-api';
    // const api = 'http://localhost:3000/'
    return this.http.get<any[]>(api, {
      params: {
        take: size,
        skip: page,
        active: this.sorting?.active || '',
        direction: this.sorting?.direction || '',
      },
    }).pipe(map((data) => data.reduce((acc, curr, i) => {
      if (i % 10 === 0) {
        this.groupCounter++;
        acc.push({ title: `group ${this.groupCounter}`, isGroup: true, isExpanded: true, groupId: this.groupCounter });
      }

      curr.groupId = this.groupCounter;
      curr.isExpanded = true;
      acc.push(curr);

      return acc;
    }, [])), tap(console.table));
  };

  private sorting?: ISorting;

  public drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(
      this.displayedColumns,
      event.previousIndex,
      event.currentIndex
    );
  }

  public sortChange(sorting: ISorting) {
    console.log(sorting);

    this.sorting = sorting;
    this.groupCounter = 0;
    this.dataSource.reset();
  }

  public onTableScroll(event: any) {
    console.log(event)
  }

  public groupHeaderClick(row: any) {
    console.log(row);

    row.isExpanded = !row.isExpanded;

    this.dataSource.toggleExpand(row.groupId, row.isExpanded);
  }

  public isGroup = (_: number, row: any) => row.isGroup;
}

type Fetcher<T> = (page: number, size: number) => Observable<T[]>;
interface ISorting {
  active: string;
  direction: string;
}

@Injectable()
export class InfiniteVirtualDataSource<T>
  extends DataSource<T>
  implements CdkVirtualScrollRepeater<T>
{
  private collapsedGroups = new Set<string>();

  private pageSize = 100; // elements
  private preloadThreshold = 20;
  private _pageCache = new Set<number>();
  private _subscription?: Subscription;
  private _viewPort!: CdkVirtualScrollViewport;
  private renderedStream = new BehaviorSubject<T[]>([]);

  // Create MatTableDataSource so we can have all sort,filter bells and whistles
  private matTableDataSource: MatTableDataSource<T> = new MatTableDataSource();

  public dataStream = this.matTableDataSource.connect().asObservable();

  constructor(private ngZone: NgZone) {
    super();
  }

  public measureRangeSize(
    range: ListRange,
    orientation: 'horizontal' | 'vertical'
  ): number {
    throw new Error('Method not implemented.');
  }

  public reset() {
    this._pageCache = new Set<number>();
    this.matTableDataSource.data = [];

    this._viewPort.setRenderedRange({ start: 0, end: 1 });
  }

  public attach(viewPort: CdkVirtualScrollViewport, fetcher: Fetcher<T>) {
    if (!viewPort) {
      throw new Error('ViewPort is undefined');
    }

    if (!fetcher) {
      throw new Error('Fetcher is undefined');
    }

    this.matTableDataSource.filterPredicate = (data: any, filter: string) => {
      if (data.isGroup) {
        return true;
      }

      console.log(this.collapsedGroups.has(data.groupId))

      return !this.collapsedGroups.has(data.groupId);
    }
    this.matTableDataSource.filter = performance.now().toString();

    this._viewPort = viewPort;

    this.initFetchingOnScrollUpdates(fetcher);

    // Attach DataSource as CdkVirtualForOf so ViewPort can access dataStream
    this._viewPort.attach(this);

    // Trigger range change so that 1st page can be loaded
    this._viewPort.setRenderedRange({ start: 0, end: 1 });

    // this._viewPort.setTotalContentSize

    // this._viewPort.setTotalContentSize((10 * this.pageSize) * 48)

    // this._viewPort.setTotalContentSize(1000*50);
  }

  public toggleExpand(groupId: any, isExpanded: any) {
    if (isExpanded) {
      this.collapsedGroups.delete(groupId);
    } else {
      this.collapsedGroups.add(groupId);
      
      // const collapsedCount =  this.collapsedGroups.size * 10;

      // let {start, end} = this._viewPort.getRenderedRange();
      // start += collapsedCount;
      // end += collapsedCount;
      // this._viewPort.setRenderedRange({start, end} );
    }

    this.matTableDataSource.filter = performance.now().toString(); 
  }

  // Called by CDK Table
  public connect(): Observable<T[]> {
    const tableData = this.matTableDataSource.connect();
    const filtered =
      this._viewPort === undefined
        ? tableData
        : this.filterByRangeStream(tableData);

    filtered.subscribe((data: T[]) => {
      this.ngZone.run(() => this.renderedStream.next(data));
    });

    return this.renderedStream.asObservable();
  }

  public disconnect(): void {
    if (this._subscription) {
      this._subscription.unsubscribe();
    }
  }

  private initFetchingOnScrollUpdates(fetcher: Fetcher<T>) {
    this._subscription = this._viewPort.renderedRangeStream
      .pipe(
        switchMap((range) => this.getPagesToDownload(range)),
        filter((page) => !this._pageCache.has(page)),
        exhaustMap((page) =>
          fetcher(page, this.pageSize).pipe(
            filter((data) => !!data.length),
            tap(() => this._pageCache.add(page)),
            tap((data) => {
              // const newData = [...this.matTableDataSource.data];
              // newData.splice(page * this.pageSize, this.pageSize, ...data);
              // this.matTableDataSource.data = newData;

              this.matTableDataSource.data = [...this.matTableDataSource.data, ...data];
            }),
            tap(() =>
              this._viewPort.setTotalContentSize(this.matTableDataSource.filteredData.length * 48)
              // this._viewPort.setTotalContentSize(this.matTableDataSource.data.length * 48)
            )
            // tap(() =>
            //   this._viewPort.setTotalContentSize((10 * this.pageSize) * 48)
            // )
          )
        )
      )
      .subscribe();
  }

  private getPagesToDownload({ start, end }: { start: number; end: number }) {
    const collapsedCount = this.collapsedGroups.size * 10;
    const startPage = this.getPageForIndex(start + collapsedCount);
    const endPage = this.getPageForIndex(end + collapsedCount + this.preloadThreshold);
    const pages: number[] = [];
    for (let i = startPage; i <= endPage; i++) {
      if (!this._pageCache.has(i)) {
        pages.push(i);
      }
    }

    return from(pages);
  }

  private getPageForIndex(index: number): number {
    return Math.floor(index / this.pageSize);
  }

  private filterByRangeStream(tableData: Observable<T[]>) {
    const rangeStream = this._viewPort.renderedRangeStream.pipe(
      startWith({} as ListRange)
    );
    const filtered = combineLatest(tableData, rangeStream).pipe(
      map(([data, { start, end }]) =>
        start === null || end === null ? data : data.slice(start, end)
      )
    );
    return filtered;
  }
}
