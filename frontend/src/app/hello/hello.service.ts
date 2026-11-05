import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { API_URL } from '../api-url';

@Service()
export class HelloService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  getHello() {
    return this.http.get(`${this.apiUrl}/`, { responseType: 'text' });
  }
}
