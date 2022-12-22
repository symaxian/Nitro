class SimpleComponent extends Nitro.Component {

	wasMounted() {
		(this.childByKey('root') as HTMLElement).focus();
	}

	wasUnmounted() {}

	render(_: Nitro.Renderer) {
		return <div key="root" tabIndex={-1}/>
	}

}

class ComponentWrapper extends Nitro.Component<Nitro.Component> {

	render(_: Nitro.Renderer) {
		return <div>{this.input}</div>
	}

}

describe('Nitro', () => {

	beforeEach(() => document.body.focus());

	describe('Can render elements', () => {

		it('Can render div', () => {
			class TestComp extends Nitro.Component {
				render(_: Nitro.Renderer) {
					return _.create('div', { id: 'elementId', className: 'elementClassName' })
				}
			}

			const elem = new TestComp().getElement();
			expect(elem.id).toBe('elementId');
			expect(elem.className).toBe('elementClassName');
		});

	});

	it('Can render component without an input and inputChanged() is not invoked with null', () => {

		class InnerComponent extends Nitro.Component {
			render(_: Nitro.Renderer) {
				return <span className="inner"/>;
			}
			inputChanged(previous: {}, current: {}): void {
				fail('Component.inputChanged() invoked on a component without an input.');
			}
		}

		class OuterComponent extends Nitro.Component {
			render(_: Nitro.Renderer) {
				return <div className="outer"><InnerComponent/></div>;
				// return <div className="outer"><InnerComponent key="innerComponent"/></div>;
			}
		}

		const component = new OuterComponent();
		component.mountUnder(document.body);
		expect(document.body.contains(component.getElement())).toBe(true);
		component.unmount();
	});

	it('Can specify id', () => {
		const id = 'myElementId';

		class TestComp extends Nitro.Component {
			render(_: Nitro.Renderer) {
				return <div id={id}/>
			}
		}

		const component = new TestComp();
		component.mountUnder(document.body);
		expect(document.getElementById(id)).toBe(component.getElement());
		component.unmount();
	});

	it('Can specify CSS class', () => {
		const cssClass = 'myCssClass';

		class TestComp extends Nitro.Component {
			render(_: Nitro.Renderer) {
				return <div className={cssClass}/>
			}
		}

		const component = new TestComp();
		component.mountUnder(document.body);
		expect(document.body.getElementsByClassName(cssClass)[0]).toBe(component.getElement());
		component.unmount();
	});

	it('Can specify id and CSS class', () => {
		const id = 'myElementId';
		const cssClass = 'myCssClass';

		class TestComp extends Nitro.Component {
			render(_: Nitro.Renderer) {
				return <div id={id} className={cssClass}/>
			}
		}

		const component = new TestComp();
		component.mountUnder(document.body);
		expect(document.getElementById(id)).toBe(component.getElement());
		expect(document.body.getElementsByClassName(cssClass)[0]).toBe(component.getElement());
		component.unmount();
	});

	it ('Can go from string input to null input through the Renderer', () => {

		class Message extends Nitro.Component<string | null> {
			render(_: Nitro.Renderer) {
				const message = (this.input === null) ? 'No message' : this.input;
				return <span>{message}</span>;
			}
		}

		class OuterComponent extends Nitro.Component<string | null> {
			render(_: Nitro.Renderer) {
				return _.create(Message, this.input);
			}
		}

		const comp = new OuterComponent();
		comp.setInput('Hello World!');
		expect(comp.getElement().textContent).toBe('Hello World!');
		comp.setInput(null);
		expect(comp.getElement().textContent).toBe('No message');
	});

	describe('Can clear state between render calls', () => {

		describe('Can clear leftover styles', () => {

			const styles: Partial<CSSStyleDeclaration> = {
				'backgroundColor': 'red',
				'color': 'blue',
				'borderBottom': '1px solid purple',
				'cursor': 'pointer',
				'font': '100px sans-serif',
				'top': '-420px',
				'visibility': 'hidden'
			};

			class Button extends Nitro.Component<{ style: keyof CSSStyleDeclaration, value: string }> {
				render(_: Nitro.Renderer) {
					const attributes = {} as any;
					if (this.input !== null) {
						attributes.style = {};
						attributes.style[this.input.style] = this.input.value;
					}
					return _.create('div', attributes);
				}
			}

			for (const styleKey in styles) {
				const styleValue = (styles as any)[styleKey];

				it('Style - ' + styleKey + ': ' + styleValue, () => {
					const button = new Button();
					button.setInput(null);
					expect((button.getElement() as any).style[styleKey]).toBe('');
					button.setInput({ style: styleKey as any, value: styleValue });
					expect((button.getElement() as any).style[styleKey]).toBe(styleValue);
					button.setInput(null);
					expect((button.getElement() as any).style[styleKey]).toBe('');
				});

			}

		});

		it('Can clear leftover tabIndex', () => {

			class Button extends Nitro.Component<boolean> {
				render(_: Nitro.Renderer) {
					return <div tabIndex={this.input ? 10 : undefined}/>
				}
			}

			const button = new Button();
			button.setInput(false);
			expect(button.getElement().tabIndex).toBe(-1);
			button.setInput(true);
			expect(button.getElement().tabIndex).toBe(10);
			button.setInput(false);
			expect(button.getElement().tabIndex).toBe(-1);
		});

		it('Can clear leftover styles when using a style object', () => {

			class Button extends Nitro.Component<any> {
				render(_: Nitro.Renderer) {
					return _.create('div', { style: this.input });
				}
			}

			const button = new Button();
			button.setInput({ top: '10px' });
			expect(button.getElement().style.top).toBe('10px');
			button.setInput({});
			expect(button.getElement().style.top).toBe('');
		});

		it('Can clear leftover data attributes', () => {

			class Button extends Nitro.Component<boolean> {
				render(_: Nitro.Renderer) {
					if (this.input) {
						return <div data-foo="bar"/>
					}
					return <div/>
				}
			}

			const button = new Button();
			button.setInput(true);
			expect(button.getElement().getAttribute('data-foo')).toBe('bar');
			button.setInput(false);
			expect(button.getElement().hasAttribute('data-foo')).toBe(false);
			button.setInput(true);
			expect(button.getElement().getAttribute('data-foo')).toBe('bar');
		});

		describe('Can clear leftover event handlers', () => {

			const eventHandlers = {
				onMouseEnter: 'onmouseenter',
				onMouseLeave: 'onmouseleave',
				onMouseDown: 'onmousedown',
				onMouseMove: 'onmousemove',
				onMouseUp: 'onmouseup',
				onKeyDown: 'onkeydown',
				onKeyUp: 'onkeyup',
				onChange: 'onchange',
				onContextMenu: 'oncontextmenu',
			};

			const eventHandlerFunction = () => {
				console.log('I\'m an event handler!');
			};

			class Button extends Nitro.Component<string> {
				render(_: Nitro.Renderer) {
					const attributes = {} as any;
					if (this.input !== null) {
						attributes[this.input] = eventHandlerFunction;
					}
					return _.create('div', attributes);
				}
			}

			for (const eventHandlerKey in eventHandlers) {
				const nativeName = (eventHandlers as any)[eventHandlerKey];

				it('Event handler - ' + eventHandlerKey + '(' + nativeName + ')', () => {
					const button = new Button();
					button.setInput(null);
					expect((button.getElement() as any)[nativeName]).toBe(null);
					button.setInput(eventHandlerKey);
					expect((button.getElement() as any)[nativeName]).toBe(eventHandlerFunction);
					button.setInput(null);
					expect((button.getElement() as any)[nativeName]).toBe(null);
				});

			}

		});

	});

	it('Does not set tab-index to -1 after reusing element', () => {

		class MySpan extends Nitro.Component<string> {
			render(_: Nitro.Renderer) {
				return <span>{this.input}</span>
			}
		}

		const component = new MySpan();
		component.setInput('1');
		component.getElement();
		component.setInput('2');
		const elem = component.getElement();
		expect(elem.tabIndex).toBe(-1);
		expect(elem.getAttribute('tabIndex')).toBe(null);
	});

	it('Does not set id to empty string after reusing element', () => {

		class MySpan extends Nitro.Component<string> {
			render(_: Nitro.Renderer) {
				return <span>{this.input}</span>
			}
		}

		const component = new MySpan();
		component.setInput('1');
		component.getElement();
		component.setInput('2');
		const elem = component.getElement();
		expect(elem.id).toBe('');
		expect(elem.getAttribute('id')).toBe(null);
	});

	describe('mounting', () => {

		it('wasMounted() called on simple component', () => {
			const myComp = new SimpleComponent();
			spyOn(myComp, 'wasMounted').and.callThrough();
			myComp.mountUnder(document.body);
			expect(myComp.wasMounted).toHaveBeenCalled();
			expect(document.activeElement).toBe(myComp.getElement());
		});

		it('wasUnmounted() called on simple component', () => {
			const myComp = new SimpleComponent();
			spyOn(myComp, 'wasUnmounted').and.callThrough();
			myComp.mountUnder(document.body);
			myComp.unmount();
			expect(myComp.wasUnmounted).toHaveBeenCalled();
		});

		it('wasMounted() called when mounting component under a div in parent component', () => {
			const myComp = new SimpleComponent();
			spyOn(myComp, 'wasMounted').and.callThrough();

			const wrapper = new ComponentWrapper();
			wrapper.setInput(myComp);

			wrapper.mountUnder(document.body);

			expect(myComp.wasMounted).toHaveBeenCalled();
			expect(document.activeElement).toBe(myComp.getElement());
		});

		it('wasMounted() called when mounting component under a div in parent component that is already mounted', () => {
			const myComp = new SimpleComponent();
			spyOn(myComp, 'wasMounted').and.callThrough();

			const wrapper = new ComponentWrapper();
			wrapper.setInput(null);

			wrapper.mountUnder(document.body);

			wrapper.setInput(myComp);
			wrapper.getElement(); // Force digest

			expect(myComp.wasMounted).toHaveBeenCalled();
			expect(document.activeElement).toBe(myComp.getElement());
		});

		it('Can move child component from one element to another element within the same parent component', () => {
			class ParentComponent extends Nitro.Component<{ showChild1: boolean, showChild2: boolean }> {
				render(_: Nitro.Renderer) {
					return <div key="main">
						{
							(this.input.showChild1 !== true ? null : <div><SimpleComponent/></div>)
						}
						{
							(this.input.showChild2 !== true ? null : <div><SimpleComponent/></div>)
						}
					</div>
				}
			}

			const parent = new ParentComponent();

			parent.setInput({ showChild1: true, showChild2: false });
			parent.getElement();

			parent.mountUnder(document.body);

			parent.setInput({ showChild1: false, showChild2: true });
			parent.getElement();

			parent.setInput({ showChild1: true, showChild2: true });
			parent.getElement();

			parent.setInput({ showChild1: true, showChild2: false });
			parent.getElement();
		});

		it('wasMounted() invoked on a component mounted via Nitro.updateChildren()', () => {

			let wasMountedCount = 0;
			let wasUnmountedCount = 0;

			class ChildComponent extends Nitro.Component {
				protected element = document.createElement('div');
				wasMounted() { wasMountedCount++; }
				wasUnmounted() { wasUnmountedCount++; }
				render() {}
			}

			class ParentComponent extends Nitro.Component<boolean> {
				protected element = document.createElement('div');
				render() {
					const children = [];
					if (this.input) {
						children.push(new ChildComponent());
					}
					Nitro.updateChildren(this.element, children)
				}
			}

			const parent = new ParentComponent();
			expect(wasMountedCount).toBe(0);
			expect(wasUnmountedCount).toBe(0);

			parent.getElement();
			expect(wasMountedCount).toBe(0);
			expect(wasUnmountedCount).toBe(0);

			parent.mountUnder(document.body);
			expect(wasMountedCount).toBe(0);
			expect(wasUnmountedCount).toBe(0);

			parent.setInput(true);
			parent.getElement();
			expect(wasMountedCount).toBe(1);
			expect(wasUnmountedCount).toBe(0);

			parent.setInput(false);
			parent.getElement();
			expect(wasMountedCount).toBe(1);
			expect(wasUnmountedCount).toBe(1);

			parent.setInput(true);
			parent.getElement();
			expect(wasMountedCount).toBe(2);
			expect(wasUnmountedCount).toBe(1);

			parent.unmount();
			expect(wasMountedCount).toBe(2);
			expect(wasUnmountedCount).toBe(2);
		});

	});

	it('Class name is not cleared when element with class name in key is reused', () => {

		class MySpan extends Nitro.Component<string> {
			render(_: Nitro.Renderer) {
				return <span id="myId" className="myClassName">{this.input}</span>
			}
		}

		const span = new MySpan()
		span.setInput('1');
		expect(span.getElement().className).toBe('myClassName');
		span.setInput('2');
		expect(span.getElement().className).toBe('myClassName');
	});

	it('Reuses elements correctly', () => {

		class MySpan extends Nitro.Component<boolean> {
			render(_: Nitro.Renderer) {
				if (this.input) {
					return <div>
						<div>1</div>,
						<span>2</span>,
						<span>3</span>,
						<span>4</span>
					</div>;
				}
				else {
					return <div>
						<span>1</span>,
						<span>2</span>,
						<div>3</div>,
						<span>4</span>
					</div>;
				}
			}
		}

		const component = new MySpan();

		component.setInput(true);
		let elem = component.getElement();
		expect(elem.children[0].textContent).toBe('1');
		expect(elem.children[1].textContent).toBe('2');
		expect(elem.children[2].textContent).toBe('3');
		expect(elem.children[3].textContent).toBe('4');

		component.setInput(false);
		elem = component.getElement();
		expect(elem.children[0].textContent).toBe('1');
		expect(elem.children[1].textContent).toBe('2');
		expect(elem.children[2].textContent).toBe('3');
		expect(elem.children[3].textContent).toBe('4');
	});

	it('Will call wasMounted() on components that are included via getElement()', () => {

		let wasMounted = false;

		class MyInnerComp extends Nitro.Component {

			wasMounted(): void {
				wasMounted = true;
			}

			render() {
				return document.createElement('div');
			}

		}

		class MyOuterComp extends Nitro.Component {

			render() {
				const div = document.createElement('div');
				div.appendChild(new MyInnerComp().getElement());
				return div;
			}

		}

		const comp = new MyOuterComp();
		comp.mountUnder(document.body);
		comp.unmount();

		expect(wasMounted).toBeTrue();

	});

	it('leftover top/left styles are removed when element is reused', () => {

		class OuterComp extends Nitro.Component<boolean> {
			render(_?: Nitro.Renderer): void | HTMLElement {
				if (this.input) {
					return <div style={{ left: '10px' }}/>;
				}
				return <div style={{ top: '10px' }}/>;
			}
		}

		const comp = new OuterComp();
		comp.mountUnder(document.body);

		comp.setInput(true);
		comp.getElement();
		expect(comp.getElement().style.left).toBe('10px');
		expect(comp.getElement().style.top).toBe('');

		comp.setInput(false);
		comp.getElement();
		expect(comp.getElement().style.left).toBe('');
		expect(comp.getElement().style.top).toBe('10px');

		comp.setInput(true);
		comp.getElement();
		expect(comp.getElement().style.left).toBe('10px');
		expect(comp.getElement().style.top).toBe('');

		comp.unmount();
	});

	it('Child component is rendered when parent component is mounted', () => {

		let lastInputToOuterComp: string | null = null;
		let lastInputToInnerComp: string | null = null;

		class InnerComp extends Nitro.Component<string> {
			protected element = document.createElement('span');
			render() {
				lastInputToInnerComp = this.input;
				this.element.textContent = this.input;
			}
		}

		class OuterComp extends Nitro.Component<string> {
			private inner = new InnerComp();
			render() {
				lastInputToOuterComp = this.input;
				this.inner.setInput(this.input);
				return this.inner.getElement();
			}
		}

		const comp = new OuterComp();
		comp.setInput('1');
		comp.mountUnder(document.body);

		expect(lastInputToOuterComp).toEqual('1');
		expect(lastInputToInnerComp).toEqual('1');

		comp.unmount();
	});

	it('Will reuse elements', () => {

		let wasRemoved = false;

		const observer = new MutationObserver(mutations => {
			mutations.forEach(mutation => {
				mutation.removedNodes.forEach(removedNode => {
					if (removedNode instanceof HTMLElement && removedNode.id == 'divThatShouldBeReused') {
						wasRemoved = true;
						observer.disconnect();
					}
				});
			});
		});

		class ListOfDivs extends Nitro.Component<string[]> {
			render(_: Nitro.Renderer): void | HTMLElement {
				return <div>
					{...this.input.map(value => <div key={value} id={value}/>)}
				</div>;
			}
		}

		const list = new ListOfDivs();
		list.setInput(['firstDiv', 'divThatShouldBeReused']);
		list.mountUnder(document.body);

		list.setInput(['divThatShouldBeReused']);
		Nitro.digest(); // In this render pass, 'firstDiv' should be removed, but 'divThatShouldBeReused' should remain in the DOM

		expect(wasRemoved).toBe(false);
	});

	it('Will reorder components rather than change input values if keys are specified', () => {

		let wasUnmountedCount = 0;
		let inputChangedCount = 0;

		class ListItem extends Nitro.PureComponent<{ text: string }> {
			wasUnmounted(): void {
				wasUnmountedCount++;
			}
			inputChanged() {
				inputChangedCount++;
			}
			render(_: Nitro.Renderer): void | HTMLElement {
				return <div>{this.input.text}</div>;
			}
		}

		class ListComponent extends Nitro.Component<string[]> {
			render(_?: Nitro.Renderer): void | HTMLElement {
				return <div>
					{...this.input.map(value => <ListItem key={value} text={value}/>)}
				</div>;
			}
		}

		const list = new ListComponent();
		list.setInput(['firstDiv', 'divThatShouldBeReused']);
		list.mountUnder(document.body);
		expect(list.getElement().children[0].textContent).toBe('firstDiv');
		expect(list.getElement().children[1].textContent).toBe('divThatShouldBeReused');

		expect(wasUnmountedCount).toBe(0);
		expect(inputChangedCount).toBe(2);

		list.setInput(['divThatShouldBeReused', 'firstDiv']);
		Nitro.digest();
		expect(list.getElement().children[0].textContent).toBe('divThatShouldBeReused');
		expect(list.getElement().children[1].textContent).toBe('firstDiv');

		expect(wasUnmountedCount).toBe(0);
		expect(inputChangedCount).toBe(2); // The inputs to the two ListItems should not have changed, instead the keys were used to re-use the component, and their positions in the DOM were just swapped.

		list.unmount();

		expect(wasUnmountedCount).toBe(2);
		expect(inputChangedCount).toBe(2);
	});

	it('Will throw an error if a key is reused for an element of a different type', () => {

		class Component extends Nitro.Component<boolean> {
			render(_?: Nitro.Renderer): void | HTMLElement {
				if (this.input) {
					return <div><h1 key="header"/></div>
				}
				return <div><h2 key="header"/></div>
			}
		}

		const comp = new Component();
		comp.setInput(false);
		expect(comp.getElement().children[0].tagName).toBe("H2");

		comp.setInput(true);
		expect(() => {
			comp.getElement();
		}).toThrow(new Error('Cannot reuse key for an element of a different tagName, current: H2, new: H1.'));

	});

	it('Will throw an error if a key is reused for a component of a different type', () => {

		class Comp1 extends Nitro.Component {
			render(_?: Nitro.Renderer): void | HTMLElement {
				return <h1/>
			}
		}

		class Comp2 extends Nitro.Component {
			render(_?: Nitro.Renderer): void | HTMLElement {
				return <h2/>
			}
		}

		class Component extends Nitro.Component<boolean> {
			render(_?: Nitro.Renderer): void | HTMLElement {
				if (this.input) {
					return <div><Comp1 key="header"/></div>
				}
				return <div><Comp2 key="header"/></div>
			}
		}

		const comp = new Component();
		comp.setInput(false);
		expect(comp.getElement().children[0].tagName).toBe("H2");

		comp.setInput(true);
		expect(() => {
			comp.getElement();
		}).toThrow(new Error('Cannot reuse key for a component of a different class, current: Comp2, new: Comp1.'));

	});

	it('Will throw an error an invalid child is given', () => {

		class DivWrapper extends Nitro.Component<any> {
			render(_?: Nitro.Renderer): void | HTMLElement {
				return _.create('div', null, this.input);
			}
		}

		const comp = new DivWrapper();

		comp.setInput(true);
		expect(() => comp.getElement()).toThrow(new Error('Cannot treat value as child: true, must be a string, HTMLElement, Component, or null.'));

		comp.setInput({});
		expect(() => comp.getElement()).toThrow(new Error('Cannot treat value as child: [object Object], must be a string, HTMLElement, Component, or null.'));

		comp.setInput(9001);
		expect(() => comp.getElement()).toThrow(new Error('Cannot treat value as child: 9001, must be a string, HTMLElement, Component, or null.'));
	});

	it('Will throw an error if attempting to give a pure component a non-object input', () => {

		class PureComp extends Nitro.PureComponent<boolean> {
			render(_?: Nitro.Renderer): void | HTMLElement {
				return <div/>
			}
		}

		const comp = new PureComp();
		expect(() => comp.setInput(false)).toThrow(new Error('Non-object input value given to instance of PureComponent, this will produce undesired behavior.'));
	});

	it('Will throw an error if attempting to swap out the root element', () => {

		class ComponentWithThatWillTryToSwapRootElement extends Nitro.Component<boolean> {
			render(_?: Nitro.Renderer): void | HTMLElement {
				if (this.input) {
					return <span/>
				}
				return <div/>
			}
		}

		const comp = new ComponentWithThatWillTryToSwapRootElement();

		comp.setInput(false);
		expect(comp.getElement().tagName).toBe('DIV');

		comp.setInput(true);
		expect(() => comp.getElement()).toThrow(new Error('Nitro does not support swapping out the root element of a component! Component: ComponentWithThatWillTryToSwapRootElement. You may need to add a key to the root element of the component.'));
	});

	it('Will not fire lifecycle events when component is moved to a different element within same component', () => {

		let mountedCount = 0;
		let unmountedCount = 0;

		class TestSpan extends Nitro.Component {
			protected element = document.createElement('span');
			wasMounted = () => mountedCount++;
			wasUnmounted = () => unmountedCount++;
			render() {}
		}

		class ComponentThatWillMoveChild extends Nitro.Component<boolean> {
			render(_?: Nitro.Renderer): void | HTMLElement {
				if (this.input) {
					return <div key="root">
						<div>
							<TestSpan/>
						</div>
					</div>;
				}
				return <div key="root">
					<TestSpan/>
				</div>;
			}
		}

		const comp = new ComponentThatWillMoveChild();
		comp.setInput(false);

		comp.mountUnder(document.body);

		expect(mountedCount).toBe(1);
		expect(unmountedCount).toBe(0);

		comp.setInput(true);
		Nitro.digest();

		expect(mountedCount).toBe(1);
		expect(unmountedCount).toBe(0);

		comp.setInput(false);
		Nitro.digest();

		comp.unmount();
		expect(mountedCount).toBe(1);
		expect(unmountedCount).toBe(1);
	});

	it('Can send DIV child to component when input object is null', () => {

		class BorderedContent extends Nitro.Component<{ children: HTMLElement | HTMLElement[] }> {
			render(_: Nitro.Renderer): void | HTMLElement {
				return <div style="border: 3px solid black">{this.input.children}</div>
			}
		}

		class TestComponent extends Nitro.Component {
			render(_: Nitro.Renderer): void | HTMLElement {
				return <BorderedContent>
					<div>Find me</div>
				</BorderedContent>;
			}
		}

		const testComponent = new TestComponent();

		const div = testComponent.getElement() as HTMLElement;
		expect(div.tagName).toBe('DIV');
		expect(div.style.border).toBe('3px solid black');

		expect(div.children[0].tagName).toBe('DIV');
		expect(div.children[0].textContent).toBe('Find me');
	});

	it('Can send DIV child to component when input object is not null', () => {

		class BorderedContent extends Nitro.Component<{ color: string, children: HTMLElement | HTMLElement[] }> {
			render(_: Nitro.Renderer): void | HTMLElement {
				return <div style={"border: 3px solid " + this.input.color}>{this.input.children}</div>
			}
		}

		class TestComponent extends Nitro.Component {
			render(_: Nitro.Renderer): void | HTMLElement {
				return <BorderedContent color="blue">
					<div>Find me</div>
				</BorderedContent>;
			}
		}

		const testComponent = new TestComponent();

		const div = testComponent.getElement() as HTMLElement;
		expect(div.tagName).toBe('DIV');
		expect(div.style.border).toBe('3px solid blue');

		expect(div.children[0].tagName).toBe('DIV');
		expect(div.children[0].textContent).toBe('Find me');
	});

	it('Can send text child to component', () => {

		class StyledSpan extends Nitro.Component<{ color: string, children: string }> {
			render(_: Nitro.Renderer): void | HTMLElement {
				return <span style={"color: " + this.input.color}>{this.input.children}</span>
			}
		}

		class TestComponent extends Nitro.Component {
			render(_: Nitro.Renderer): void | HTMLElement {
				return <StyledSpan color="blue">Some text</StyledSpan>;
			}
		}

		const testComponent = new TestComponent();

		const div = testComponent.getElement() as HTMLElement;
		expect(div.tagName).toBe('SPAN');
		expect(div.style.color).toBe('blue');
		expect(div.textContent).toBe('Some text');
	});

	it('Can specify false as a child', () => {

		class TestComponent extends Nitro.Component<string | false> {
			render(_: Nitro.Renderer): void | HTMLElement {
				return <div>{this.input}</div>;
			}
		}

		const testComponent = new TestComponent();

		testComponent.setInput('Test');
		const elem = testComponent.getElement();
		expect(elem.tagName).toBe('DIV');
		expect(elem.textContent).toBe('Test');

		testComponent.setInput(false);
		const elem2 = testComponent.getElement();
		expect(elem2.tagName).toBe('DIV');
		expect(elem2.textContent).toBe('');
	});

});