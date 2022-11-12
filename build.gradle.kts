repositories {
	mavenCentral()
}

val nitroConfiguration = configurations.create("nitroConfiguration")

dependencies {
	// https://mvnrepository.com/artifact/com.google.javascript/closure-compiler
	nitroConfiguration("com.google.javascript:closure-compiler:v20221102")
}

configurations {
}

version "1.0-SNAPSHOT"

tasks.create<Exec>("compileNitroTS") {
	inputs.file("build.gradle.kts")
	inputs.files("Nitro.ts")

	commandLine("cmd", "/c", "tsc")
}

tasks.create<Exec>("compileNitroJS") {
	dependsOn(nitroConfiguration.artifacts)
	dependsOn("compileNitroTS")

	inputs.file("build.gradle.kts")
	inputs.file("out/Nitro.js")
	outputs.file("out/Nitro.min.js")

	val argList = ArrayList<String>()

	argList.add("java")
	argList.add("-jar")
	argList.add(configurations["nitroConfiguration"].files.toTypedArray()[0].path)
	argList.add("--compilation_level")
	argList.add("SIMPLE_OPTIMIZATIONS")
//	argList.add("ADVANCED_OPTIMIZATIONS")
	argList.add("--language_out")
	argList.add("ECMASCRIPT_2015")
	if (project.hasProperty("debug")) argList.add("--debug")
	argList.add("--js")
	argList.add("externs.js")
	argList.add("--js")
	argList.add("out/Nitro.js")
	argList.add("--js_output_file")
	argList.add("out/Nitro.min.js")

	commandLine(argList)

	doLast {
		println("nitro.min.js filesize: " + File("out/Nitro.min.js").length()/1000 + "kb")
//		println("classpath = ${configurations["nitroConfiguration"].map { file: File -> file.name }}")
	}
}

tasks.create<Exec>("compileUnitTests") {
	inputs.file("build.gradle.kts")
	inputs.files("unit_tests")

	workingDir("unit_tests")
	commandLine("cmd", "/c", "tsc")

}

tasks.create("build") {
	dependsOn("compileNitroJS")
	dependsOn("compileUnitTests")
}

tasks.create<Delete>("clean") {
	delete("out")
}

