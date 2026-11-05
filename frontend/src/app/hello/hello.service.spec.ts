import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL } from '../api-url';
import { HelloService } from './hello.service';

describe('HelloService', () => {
  it('GETs the API root as plain text', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: 'http://localhost:3000' },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    let result = '';

    TestBed.inject(HelloService)
      .getHello()
      .subscribe((text) => (result = text));

    const req = http.expectOne('http://localhost:3000/');
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('text');
    req.flush('Hello World!');
    expect(result).toBe('Hello World!');
    http.verify();
  });
});
