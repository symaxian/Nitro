# Nitro

![Nitro Logo](logo.png)

Nitro is a lightweight component framework written in TypeScript that focuses on flexibility and performance. Within Nitro every component is a class that may declare and consume input and that represents a single root element(as well as its styling and children).

Nitro is:
- Tiny
- Flexible
- Fast

WARNING: Nitro is in early alpha and contains bugs.

File listing:
- README.md - This file
- build.gradle.kts - Gradle build file, the `build` task will build all artifacts in the out folder(requires `tsc` to be installed globally), the `clean` task will delete the out folder.
- Nitro.ts - The source for Nitro
- tsconfig.json - The tsconfig file to compile Nitro(to out/Nitro.js)
- externs.js - Externs file for advanced minification, currently unused as advanced compilation is not enabled
- out/
	- Nitro.js - Unminified JavaScript of Nitro
	- Nitro.d.ts - TypeScript definitions for Nitro
	- Nitro.min.js - Minified version of Nitro
	- NitroSpec.js - Compiled unit tests
- unit_tests/
	- NitroSpecRunner.html - Web page that runs unit tests
	- NitroSpec.tsx - Unit tests for Nitro
	- tsconfig.json - The tsconfig file to compile the unit tests(NitroSpec.tsx) into ../out/NitroSpec.js
	- lib/ - Contains Jasmine

To use Nitro, include the Nitro.js or Nitro.min.js file, the "Nitro" namespace will be attached to window and accessible globally. Nitro is currently not modularized.

Let's jump right into some examples:

## A simple component
In this example we're creating a very simple component that just returns a `<span>` with some text and mounting it under the `<body>` of our HTML document.
```TypeScript
class MyComponent extends Nitro.Component { // To create your own component, just extend from Nitro.Component.

	// Every component must have a render() method.
	render() {
		// In this component, we're just creating a new HTML element and returning it.
		// Later examples show how you can return other types of content from the render() method.
		const mySpan = document.createElement('span');
		mySpan.textContent = 'Hello World!';
		return mySpan;
	}

}

// To render our component in HTML, we create an instance of it and call the mountUnder() method to add it as a child under <body>.
const mySpan = new MyComponent();
mySpan.mountUnder(document.body);
```




## Giving our component some input
In this example we deal with the `input` of a component. Components may take in input to modify their appearance or behavior.
```TypeScript
class MyComponent2 extends Nitro.Component<string> { // To declare that our component takes input, we use a generic interface, this component just takes in input of type 'string'.

	render() {
		const mySpan = document.createElement('span');
		mySpan.textContent = this.input; // You can access the input within the component via "this.input"
		return mySpan;
	}

}

const mySpan = new MyComponent2();
mySpan.setInput('Hello World!'); // Before we mount the component in the document, we must give it some input with the setInput() method.
mySpan.mountUnder(document.body);
```




## More complexity
- The input to a component may also be an object. This allows us multitudes of ways to change the behavior of an instance of our component.
- For performance, we can create HTML elements within our component class and manage them manually.
```TypeScript
class CustomSpan extends Nitro.Component<{ text: string, color: string}> { // In order to take in 'text' and 'color' values we declare our input type to be an object that contains those fields.

	private span = document.createElement('span'); // Here we instantiate and store our <span> as a private field in order to re-use it.

	render() {
		// Since we created the <span> and are keeping it as a member of this class, just update the properties on it and return it.
		this.span.textContent = this.input.text;
		this.span.style.color = this.input.color;
		return this.span;
	}

}

const mySpan = new CustomSpan();
mySpan.setInput({
	text: 'Hello World!',
	color: 'blue'
});
mySpan.mountUnder(document.body);
```




## Getting declarative
- To aid in constructing complex components, Nitro supports rendering HTML elements as well as custom components via JSX.
```TSX
// For readability, we declare the input type as a named type.
type CustomSpanWithBackgroundInput = {
	text: string;
	color: string;
	margin: number;
	backgroundColor: string;
}

class CustomSpanWithBackground extends Nitro.Component<CustomSpanWithBackgroundInput> {

	render(_: Nitro.Renderer) { // In order to use the JSX/TSX syntax, you must declare this parameter for the component's render() method.
		const input = this.input;
		return <div style={'margin: ' + input.margin + 'px; background-color: ' + input.backgroundColor}>
			<span style={'color: ' + input.color}>{input.text}</span>
		</div>;
	}

}

const myComponent = new CustomSpanWithBackground();
myComponent.setInput({
	text: 'Hello World!',
	color: 'blue',
	margin: 10,
	backgroundColor: 'light-grey'
});
myComponent.mountUnder(document.body);

// Here we use a setTimeout() to change the input of our component 1 second into the future.
// As our component is already mounted, we do not need to mount it again, Nitro will automatically update the component after we call setInput().
setTimeout(() => {
	myComponent.setInput({
		text: 'Hello World from one second in the past!',
		color: 'red',
		margin: 10,
		backgroundColor: 'light-grey'
	});
}, 1000);
```
Note: In order to use JSX/TSX, the JSX syntax must be compiled down to invocations to the Nitro.Renderer class provided to the render() method(usually identified with a single underscore). If using the TypeScript compiler, these are the tsconfig.json options to enable this compilation:
```JSON
"jsx": "react",
"jsxFactory": "_.create",
```




## Composition
- The Renderer also allows us a way to render components within other components. The code below is another way to write the above, just broken into two components, one for the div and one for the span.
```TSX
// If you extend Nitro.PureComponent, Nitro will only re-render the component if any of the fields in the input(the input type must be an object) fail a shallow comparison.
class CustomSpan extends Nitro.PureComponent<{ text: string, color: string }> {
	render(_: Nitro.Renderer) {
		return <span style={'color: ' + this.input.color}>{this.input.text}</span>;
	}
}

type CustomSpanWithBackgroundInput = {
	text: string;
	color: string;
	margin: number;
	backgroundColor: string;
}

class CustomSpanWithBackground2 extends Nitro.Component<CustomSpanWithBackgroundInput> {

	render(_: Nitro.Renderer) {
		const input = this.input;
		return <div style={'margin: ' + input.margin + 'px; background-color: ' + input.backgroundColor}>
			<CustomSpan color={input.color} text={input.text}/>
		</div>;
	}

}

const myComponent = new CustomSpanWithBackground2();
myComponent.setInput({
	text: 'Hello World!',
	color: 'blue',
	margin: 10,
	backgroundColor: 'light-grey'
});
myComponent.mountUnder(document.body);

setTimeout(() => {
	// When we set this new input state onto myComponent, Nitro will ultimately call the render() method on it(CustomSpanWithBackground2). This will then pass the text and color fields to CustomSpan, however, as CustomSpan extends from PureComponent and since we did not change the text or color values from their previous values, the render() method on CustomSpan will not be invoked a second time.
	myComponent.setInput({
		text: 'Hello World!',
		color: 'blue',
		margin: 10,
		backgroundColor: 'black'
	});
}, 1000);
```






## Keys, lifecycle hooks, and interactivity
- When the `Renderer` is used to create an element, giving it a `key` value will allow you to obtain a reference to that element after it has been created.
- Nitro can notify your component of certain events if your component implements certain methods.
- If a component's `render()` method depends on internal state(other than the `input` field) and that state changes, the `setDirty()` method must be called to tell Nitro to re-render the component.
```TSX
type MyButtonInput = { text: string, clickedTwice: () => void };

class MyButton extends Nitro.PureComponent<MyButtonInput> {

	private clickedCount = 0;

	// This method is invoked immediately after this component is added to the DOM(this HTML document).
	wasMounted() {
		// Here we use the childByKey() method to grab the HTMLDivElement that we identified with the same key when we created the div using the Renderer.
		// Advanced note: Nitro will re-use elements that have the same key between render() invocations. This can improve performance in certain scenarios.
		const div = this.childByKey('myButtonDiv');
		// Since the wasMounted() method is called after this component has been added to the DOM, it is safe to check the offsetWidth and offsetHeight properties.
		const width = div.offsetWidth;
		const height = div.offsetHeight;
		window.alert('Hello! This button was added to the DOM! My size is: (' + width + ',' + height + ')');
	}

	// This method is invoked immediately after this component is removed from the DOM.
	wasUnmounted() {
		window.alert('Goodbye :[');
	}

	// This method is unused in this example, but demonstrates the inputChanged() method.
	// Since MyButton is a PureComponent, this method(and render) will only be invoked if the text or clickedTwice values change.
	inputChanged(currentInput: MyButtonInput, newInput: MyButtonInput) {
		console.log('Input changed from ' + JSON.stringify(currentInput) + ' to ' + JSON.stringify(newInput));
	}

	render(_: Nitro.Renderer) {
		const text = this.input.text + ' - I\'ve been clicked ' + this.clickedCount + ' times!';
		return <div key="myButtonDiv" onClick={() => this.wasClicked()}>
			{text}
		</div>
	}

	private wasClicked() {
		this.clickedCount++;
		this.setDirty(); // Because we aren't actually changing the input of the component, only a private field, we need to call setDirty() to tell Nitro to re-render this component
		if (this.clickedCount === 2) {
			this.input.clickedTwice();
		}
	}

}

const button = new MyButton();
button.setInput({
	text: 'Click Me!',
	clickedTwice: () => {
		button.unmount(); // We simply call the unmount() method to remove this component from the document
	}
});
button.mountUnder(document.body);
```






## Who needs JSX and cleanly typed input objects, I'll go make my own state management methods!
- If desired, components can completely ignore the input system and require the parent component/code to invoke methods on the component class to modify state.
```TSX
class CustomSpanWithBackground extends Nitro.Component {

	// Create this component's element in the constructor
	protected element = document.createElement('span'); // Note: Must be 'protected' to match the visibility of the field on the super class.

	// Rather than use an input object we maintain our state internally.
	private text: string = '';
	private font: string = '12pt Arial';

	constructor() {
		super();
		this.element.style.font = this.font; // Go ahead and set the initial font-size
	}

	// Since this component does not have an input field or setInput() method, we must provide other ways by which the internal state of this component can be set.

	setText(text: string) {
		if (text !== this.text) {
			this.text = text;
			this.element.textContent = text;
		}
	}

	setFontSize(font: number) {
		if (font !== this.font) {
			this.font = font;
			this.element.style.font = font;
		}
	}

	// Since we've already defined the element for this component during construction, and we update the element's style in setText() and setFont(), we do not need to do anything in render().
	render() {}

}

// Here is a version of the above component written in the more canonical fashion using JSX.
class CustomSpanWithBackground extends Nitro.PureComponent<{ text: string, font: string }> {
	render(_: Nitro.Renderer) {
		return <span style={'font: ' + this.input.font}>{this.input.text}</span>;
	}
}

```


TODO:
- More examples, more tests, code coverage analysis.
- Investigate compatibility with older browsers, possibly use shims or a lower language level.
- Build multiple versions of Nitro: development, production, versions that support older browsers?
- More error checking, give descriptive error messages and possible solutions, "save the user from themselves".
- What is the best way to solve the "root element requires a key" problem? Should we just live with it as a quirk of the library? Should we add another "root" input that serves the same function as key="root" but is more concise and descriptive?
- If a component takes in a non-object input, could it still be created using JSX if we look for a "special field" in the JSX input object, like `<MyButton input="TheSingleInputValue"/>`?
- Should/can we detect when a component tries to render before input has been given? Should the initial input be a required parameter to the constructor?
- Should Component.mount() and Component.mountUnder() be moved to the Nitro namespace? Can we move/remove the mountedState field to trim down the Component class?
- Is there a better name than "dirtied" and "setDirty()"?
- Should we re-render components that are dirtied but not mounted?
- Should Renderer.create(Component) return the instance of the Component instead of the component's element? Would make it easier to store child components as fields rather than using something like this.childByKey()
- Should we split a "ref" property out of key and add this.childByRef() to reduce "key"'s responsibilities? Something like this.childrenByRef() could be added to collect multiple children.
