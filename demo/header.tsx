import React from 'react';
import './styles/header.css';

export default function() {
	return (
		<div className="header">
			<span className="site-name">Yet Another Web Worker Framework By Me</span>
			<nav>
				<ul>
					<li><a href="./">Home</a></li>
				</ul>
			</nav>
		</div>
	)
}