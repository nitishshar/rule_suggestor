import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GenericRuleEditorComponent } from './generic-rule-editor.component';

describe('GenericRuleEditorComponent', () => {
  let component: GenericRuleEditorComponent;
  let fixture: ComponentFixture<GenericRuleEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GenericRuleEditorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GenericRuleEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
