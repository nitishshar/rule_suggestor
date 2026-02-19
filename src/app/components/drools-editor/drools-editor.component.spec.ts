import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DroolsEditorComponent } from './drools-editor.component';

describe('DroolsEditorComponent', () => {
  let component: DroolsEditorComponent;
  let fixture: ComponentFixture<DroolsEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DroolsEditorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DroolsEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
