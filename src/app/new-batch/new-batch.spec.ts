import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { routes } from '../app.routes';
import { NewBatch, newBatchUrl } from './new-batch';

describe('newBatchUrl', () => {
  it('carries the node id as a query parameter', () => {
    expect(newBatchUrl(17)).toBe('/batches/new?nodeId=17');
  });

  it('points at a route the app has', () => {
    const path = newBatchUrl(1).split('?')[0].replace(/^\//, '');
    expect(routes.some((route) => route.path === path)).toBe(true);
  });
});

describe('NewBatch page', () => {
  const render = async (nodeId?: string): Promise<string> => {
    TestBed.configureTestingModule({ imports: [NewBatch], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(NewBatch);
    if (nodeId !== undefined) fixture.componentRef.setInput('nodeId', nodeId);
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  };

  it('shows the node it was opened for', async () => {
    expect(await render('17')).toContain('Node id: 17');
  });

  it('says so when it was opened without a node', async () => {
    expect(await render()).toContain('No node id was given');
  });
});
