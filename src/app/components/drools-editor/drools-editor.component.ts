import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  OnInit,
  forwardRef,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';

@Component({
  selector: 'app-drools-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './drools-editor.component.html',
  styleUrls: ['./drools-editor.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DroolsEditorComponent),
      multi: true,
    },
  ],
})
export class DroolsEditorComponent implements OnInit, ControlValueAccessor {
  @ViewChild('textarea') textarea!: ElementRef<HTMLTextAreaElement>;

  // Configuration inputs
  @Input() placeholder: string = 'Drools expression will appear here...';
  @Input() readonly: boolean = false;
  @Input() autoGenerate: boolean = false; // Auto-generate on focus if empty
  @Input() showCopyButton: boolean = true;
  @Input() showHint: boolean = true;
  @Input() showExamples: boolean = true;
  @Input() minHeight: string = '200px';
  @Input() label: string = 'DROOLS Rule Expression';

  // Outputs
  @Output() droolsChanged = new EventEmitter<string>();
  @Output() copyRequested = new EventEmitter<void>();
  @Output() generateRequested = new EventEmitter<void>();
  @Output() focusChanged = new EventEmitter<boolean>();

  // Internal state
  droolsText = signal('');
  copySuccess = signal(false);
  showExamplesPanel = signal(false);

  // Drools examples
  droolsExamples = [
    {
      title: 'Existence - Attribute Population',
      description: 'Check if required attributes are populated',
      logicalRule: 'Produce Error If Contract Identifier is null or empty',
      droolsExpression: '<Deposits.Deposits Contract>:(<Contract Identifier> == null || <Contract Identifier> == "")'
    },
    {
      title: 'Comparison - Data Element Comparison',
      description: 'Compare values between two data elements',
      logicalRule: 'Produce Error If Balance greater than Transaction Amount',
      droolsExpression: '<Deposits.Deposits Account>:(<Balance> > <Transaction Amount>)'
    },
    {
      title: 'Natural Language - Using "is"',
      description: 'Natural language equality check',
      logicalRule: 'Produce Error If Balance is 0',
      droolsExpression: '<Deposits.Deposits Account>:(<Balance> == 0)'
    },
    {
      title: 'Domain Values - Using "in"',
      description: 'Validate values against predefined list',
      logicalRule: 'Produce Error If life cycle status code not in [ACTIVE,CLOSED,PENDING]',
      droolsExpression: '<Deposits.Deposits>:(<life cycle status code> not in (\'ACTIVE\', \'CLOSED\', \'PENDING\'))'
    },
    {
      title: 'Grouped Conditions - Using Parentheses',
      description: 'Complex conditions with logical grouping',
      logicalRule: 'Produce Error If Balance is 0 and (Status is ACTIVE or Status is PENDING)',
      droolsExpression: '<Deposits.Deposits Account>:(<Balance> == 0 && (<Status> == "ACTIVE" || <Status> == "PENDING"))'
    },
    {
      title: 'Populated Check',
      description: 'Check if field has a value (is not null)',
      logicalRule: 'Produce Error If Contract Identifier is populated',
      droolsExpression: '<Deposits.Deposits Contract>:(<Contract Identifier> != null)'
    }
  ];

  // FormControl integration
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  disabled = false;

  ngOnInit() {
    // Component ready
  }

  // ControlValueAccessor implementation
  writeValue(value: string): void {
    if (value !== this.droolsText()) {
      this.droolsText.set(value || '');
      if (this.textarea?.nativeElement) {
        this.textarea.nativeElement.value = value || '';
      }
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInput(event: Event) {
    const ta = event.target as HTMLTextAreaElement;
    const value = ta.value;
    this.droolsText.set(value);
    this.onChange(value);
    this.droolsChanged.emit(value);
  }

  onFocus() {
    this.onTouched();
    this.focusChanged.emit(true);
    
    // Auto-generate if enabled (always trigger so container can decide if regeneration is needed)
    if (this.autoGenerate) {
      this.generateRequested.emit();
    }
  }

  onBlur() {
    this.focusChanged.emit(false);
  }

  async copyToClipboard() {
    const text = this.droolsText();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      this.copySuccess.set(true);
      setTimeout(() => this.copySuccess.set(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  requestGenerate() {
    this.generateRequested.emit();
  }

  useExample(example: { title: string; description: string; logicalRule: string; droolsExpression: string }) {
    this.droolsText.set(example.droolsExpression);
    if (this.textarea?.nativeElement) {
      this.textarea.nativeElement.value = example.droolsExpression;
    }
    this.showExamplesPanel.set(false);
    this.onChange(example.droolsExpression);
    this.droolsChanged.emit(example.droolsExpression);
  }
}
